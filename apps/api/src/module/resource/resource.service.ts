import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { Prisma } from "../../../generated/prisma/client.js";
import type { AudienceType, UploaderType } from "../../../generated/prisma/enums.js";
import { isClassRepresentative, isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { openStoredFile, removeStoredFile, sha256, storeFile, type StoredObject } from "../../lib/drive.js";
import { prisma } from "../../lib/prisma.js";
import {
  buildOwnUploadsWhere,
  buildReadableResourceWhere,
  buildVisibilityWhere,
  moderatesResource,
  type Viewer,
} from "../../lib/visibility.js";
import { AppError } from "../../utils/AppError.js";
import { findModeratable } from "../moderation/moderation.service.js";
import { notifyUsers } from "../notification/notification.service.js";
import type {
  ResourceDetail,
  ResourceListItem,
  ResourceListResult,
  ResourceUploadResult,
  ResourceVersionHistoryItem,
  ResourceVersionUploadResult,
  ResourceVersionView,
} from "./resource.interface.js";
import type {
  EditResourceMetadataInput,
  ListOwnResourcesQuery,
  ListResourcesQuery,
  AddResourceGrantsInput,
  PublishResourceInput,
  UploadResourceInput,
} from "./resource.validation.js";

/**
 * S3-B3 — uploading a resource.
 *
 * The file is stored first, then `PhysicalFile` + `Resource` + `ResourceVersion`
 * v1 (+ `ResourceBatchGrant` rows for PERMITTED) are written in one transaction.
 * If that transaction fails the freshly stored bytes are deleted again, so the
 * file host never keeps an orphan (playbook §10, S3-B3).
 */

/** What the caller's role allows at upload time (playbook §10 role table). */
interface UploadPolicy {
  uploaderType: UploaderType;
  allowedAudiences: readonly AudienceType[];
  defaultAudience: AudienceType;
  state: "PENDING" | "APPROVED";
  collegeId: string | null;
  isStudent: boolean;
  /** A student's own batch; `null` for teachers and Platform Admins. */
  sessionId: string | null;
}

type TeacherProfile = Extract<NonNullable<AuthUser["profile"]>, { kind: "teacher" }>;

const STUDENT_AUDIENCES = ["COLLEGE"] as const;
const CR_AUDIENCES = ["COLLEGE", "PLATFORM"] as const;
const TEACHER_AUDIENCES = ["PRIVATE", "PERMITTED", "PLATFORM"] as const;
const ADMIN_AUDIENCES = ["PRIVATE", "COLLEGE", "PERMITTED", "PLATFORM"] as const;

const uploadPolicy = (auth: AuthUser): UploadPolicy => {
  if (isPlatformAdmin(auth.roles)) {
    return {
      uploaderType: "ADMIN",
      allowedAudiences: ADMIN_AUDIENCES,
      defaultAudience: "PRIVATE",
      state: "APPROVED",
      // A Platform Admin has no profile, so `collegeId` comes from the form.
      collegeId: null,
      isStudent: false,
      sessionId: null,
    };
  }

  const profile = auth.profile;

  if (!profile) {
    throw AppError.forbidden("Only a student, teacher or Platform Admin can upload", "FORBIDDEN_ROLE");
  }

  if (profile.verificationStatus !== "ACTIVE") {
    throw AppError.forbidden(
      "Your registration is not verified yet. Ask your CR (students) or Sub Admin (teachers) to approve it.",
      "PROFILE_NOT_ACTIVE",
    );
  }

  if (profile.kind === "student") {
    const representative = isClassRepresentative(auth.roles);

    return {
      uploaderType: "STUDENT",
      allowedAudiences: representative ? CR_AUDIENCES : STUDENT_AUDIENCES,
      defaultAudience: "COLLEGE",
      // A CR / Co-CR upload skips the queue (A.4); a regular student's does not.
      state: representative ? "APPROVED" : "PENDING",
      collegeId: profile.collegeId,
      isStudent: true,
      sessionId: profile.sessionId,
    };
  }

  return {
    uploaderType: "TEACHER",
    allowedAudiences: TEACHER_AUDIENCES,
    defaultAudience: "PRIVATE",
    state: "APPROVED",
    collegeId: profile.collegeId,
    isStudent: false,
    sessionId: null,
  };
};

const audienceNotAllowed = (policy: UploadPolicy): AppError =>
  policy.isStudent
    ? AppError.forbidden(
        "Students can only post to their own college. Only a CR or Co-CR may publish to the platform.",
        "AUDIENCE_NOT_ALLOWED",
      )
    : AppError.forbidden("Teachers can upload as PRIVATE, PERMITTED or PLATFORM", "AUDIENCE_NOT_ALLOWED");

interface UploadContext {
  collegeId: string;
  departmentId: string;
  courseId: string;
  audience: AudienceType;
  state: "PENDING" | "APPROVED";
  /** Batches the resource is shared with; non-empty only for PERMITTED. */
  sessionIds: string[];
  policy: UploadPolicy;
}

/** Every scope rule that needs the database, with the message the user sees. */
const resolveUploadContext = async (
  auth: AuthUser,
  input: UploadResourceInput,
): Promise<UploadContext> => {
  const policy = uploadPolicy(auth);
  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    select: {
      id: true,
      isActive: true,
      departmentId: true,
      department: { select: { isActive: true } },
    },
  });

  if (!course) {
    throw AppError.notFound("Course not found", "COURSE_NOT_FOUND");
  }

  if (!course.isActive) {
    throw AppError.badRequest("This course is deactivated", "COURSE_INACTIVE");
  }

  if (!course.department.isActive) {
    throw AppError.badRequest("This department is deactivated", "DEPARTMENT_INACTIVE");
  }

  const profile = auth.profile;

  if (policy.isStudent && (profile?.kind !== "student" || course.departmentId !== profile.departmentId)) {
    throw AppError.badRequest("Pick a course of your own department", "INVALID_COURSE");
  }

  if (
    policy.uploaderType === "TEACHER" &&
    (profile?.kind !== "teacher" || !profile.departmentIds.includes(course.departmentId))
  ) {
    throw AppError.badRequest("Pick a course of one of your departments", "INVALID_COURSE");
  }

  const collegeId = policy.collegeId ?? input.collegeId;

  if (!collegeId) {
    throw AppError.badRequest(
      "A Platform Admin must choose the college the resource belongs to",
      "COLLEGE_REQUIRED",
    );
  }

  const collegeDepartment = await prisma.collegeDepartment.findUnique({
    where: { unique_college_department: { collegeId, departmentId: course.departmentId } },
    select: { college: { select: { isActive: true } } },
  });

  if (!collegeDepartment) {
    throw AppError.badRequest("That college does not offer this course's department", "INVALID_COLLEGE");
  }

  if (!collegeDepartment.college.isActive) {
    throw AppError.badRequest("That college is deactivated", "COLLEGE_INACTIVE");
  }

  const audience = input.audience ?? policy.defaultAudience;

  if (!policy.allowedAudiences.includes(audience)) {
    throw audienceNotAllowed(policy);
  }

  const sessionIds = [...new Set(input.sessionIds ?? [])];

  if (sessionIds.length > 0) {
    if (audience !== "PERMITTED") {
      throw AppError.badRequest("Only a PERMITTED resource is shared with batches", "INVALID_SESSIONS");
    }

    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds }, departmentId: course.departmentId, isActive: true },
      select: { id: true },
    });

    if (sessions.length !== sessionIds.length) {
      throw AppError.badRequest(
        "Every batch must be an active session of the resource's department",
        "INVALID_SESSIONS",
      );
    }
  }

  return {
    collegeId,
    departmentId: course.departmentId,
    courseId: course.id,
    audience,
    state: policy.state,
    sessionIds,
    policy,
  };
};

const detailSelect = {
  id: true,
  title: true,
  description: true,
  tags: true,
  resourceType: true,
  audience: true,
  state: true,
  uploaderType: true,
  collegeId: true,
  departmentId: true,
  courseId: true,
  sessionId: true,
  currentVersionId: true,
  createdAt: true,
  updatedAt: true,
  uploader: { select: { id: true, name: true } },
  college: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  course: { select: { id: true, name: true } },
  session: { select: { id: true, name: true } },
  versions: {
    orderBy: { versionNo: "asc" },
    select: {
      id: true,
      versionNo: true,
      state: true,
      rejectionReason: true,
      createdAt: true,
      physicalFile: { select: { mimeType: true, sizeBytes: true } },
    },
  },
  batchGrants: { select: { sessionId: true, session: { select: { name: true } } } },
} as const;

type DetailRow = Prisma.ResourceGetPayload<{ select: typeof detailSelect }>;

const parseTags = (tags: string | null): string[] =>
  tags
    ? tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    : [];

const toVersionView = (version: DetailRow["versions"][number]): ResourceVersionView => ({
  id: version.id,
  versionNo: version.versionNo,
  state: version.state,
  rejectionReason: version.rejectionReason,
  createdAt: version.createdAt.toISOString(),
  mimeType: version.physicalFile?.mimeType ?? null,
  sizeBytes: version.physicalFile ? Number(version.physicalFile.sizeBytes) : null,
});

export const toResourceDetail = (row: DetailRow): ResourceDetail => ({
  id: row.id,
  title: row.title,
  description: row.description,
  tags: parseTags(row.tags),
  resourceType: row.resourceType,
  audience: row.audience,
  state: row.state,
  uploaderType: row.uploaderType,
  collegeId: row.collegeId,
  departmentId: row.departmentId,
  courseId: row.courseId,
  sessionId: row.sessionId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  uploader: row.uploader,
  college: row.college,
  department: row.department,
  course: row.course,
  session: row.session,
  currentVersionId: row.currentVersionId,
  versions: row.versions.map(toVersionView),
  grants: row.batchGrants.map((grant) => ({
    sessionId: grant.sessionId,
    sessionName: grant.session.name,
  })),
});

/** The multipart file, as `singleFile()` leaves it on the request. */
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const storageUnavailable = (): AppError =>
  AppError.serviceUnavailable(
    "The file could not be stored. Please retry in a moment.",
    "STORAGE_UNAVAILABLE",
  );

/** S3-B3 — `POST /api/v1/resources` (multipart: fields + `file`). */
export const uploadResource = async (
  auth: AuthUser,
  input: UploadResourceInput,
  file: UploadedFile | undefined,
): Promise<ResourceUploadResult> => {
  if (!file) {
    throw AppError.badRequest("Attach the file to upload", "FILE_REQUIRED");
  }

  const context = await resolveUploadContext(auth, input);
  const contentHash = sha256(file.buffer);

  // Dedup (A.12): identical bytes reuse the existing PhysicalFile row.
  const existingFile = await prisma.physicalFile.findUnique({
    where: { contentHash },
    select: { id: true },
  });

  let physicalFileId = existingFile?.id ?? null;
  let stored: StoredObject | null = null;

  if (!physicalFileId) {
    const newFileId = randomUUID();

    try {
      stored = await storeFile({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileId: newFileId,
      });
    } catch {
      throw storageUnavailable();
    }

    physicalFileId = newFileId;
  }

  const storedFile = stored;
  const storedFileId = physicalFileId;
  const versionState = context.state === "APPROVED" ? "APPROVED" : "PENDING";

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (storedFile) {
        await tx.physicalFile.create({
          data: {
            id: storedFileId as string,
            contentHash,
            sizeBytes: BigInt(file.size),
            mimeType: file.mimetype,
            storageProvider: storedFile.provider,
            driveFileId: storedFile.provider === "GOOGLE_DRIVE" ? storedFile.fileId : null,
            driveFolderId: storedFile.folderId,
            driveWebViewLink: storedFile.webViewLink,
            driveWebContentLink: storedFile.webContentLink,
          },
        });
      }

      const resource = await tx.resource.create({
        data: {
          uploaderId: auth.userId,
          uploaderType: context.policy.uploaderType,
          collegeId: context.collegeId,
          departmentId: context.departmentId,
          courseId: context.courseId,
          sessionId: context.policy.sessionId,
          title: input.title,
          description: input.description ?? null,
          tags: input.tags && input.tags.length > 0 ? input.tags.join(",") : null,
          resourceType: input.resourceType,
          audience: context.audience,
          state: context.state,
        },
        select: { id: true },
      });

      const version = await tx.resourceVersion.create({
        data: {
          resourceId: resource.id,
          versionNo: 1,
          physicalFileId: storedFileId,
          state: versionState,
          uploadedById: auth.userId,
        },
        select: { id: true },
      });

      await tx.resource.update({
        where: { id: resource.id },
        data: { currentVersionId: version.id },
      });

      if (context.audience === "PERMITTED" && context.sessionIds.length > 0) {
        await tx.resourceBatchGrant.createMany({
          data: context.sessionIds.map((sessionId) => ({
            resourceId: resource.id,
            sessionId,
            collegeId: context.collegeId,
            departmentId: context.departmentId,
            grantedById: auth.userId,
          })),
        });
      }

      return tx.resource.findUniqueOrThrow({ where: { id: resource.id }, select: detailSelect });
    });

    return { ...toResourceDetail(created), deduplicated: Boolean(existingFile) };
  } catch (error) {
    // The DB write failed after the bytes were stored, so drop them again.
    if (storedFile && storedFileId) {
      await removeStoredFile({
        storageProvider: storedFile.provider,
        driveFileId: storedFile.provider === "GOOGLE_DRIVE" ? storedFile.fileId : null,
        id: storedFileId,
      }).catch(() => undefined);
    }

    throw error;
  }
};

const resourceNotFound = (): AppError => AppError.notFound("Resource not found", "RESOURCE_NOT_FOUND");

/** S3-B7 — uploader-only metadata edits; scope and state are never writable here. */
export const editResourceMetadata = async (
  auth: AuthUser,
  id: string,
  input: EditResourceMetadataInput,
): Promise<ResourceDetail> => {
  const owned = await prisma.resource.findFirst({
    where: { id, uploaderId: auth.userId, deletedAt: null, state: { not: "DELETED" } },
    select: { id: true },
  });

  if (!owned) throw resourceNotFound();

  const updated = await prisma.resource.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.tags !== undefined ? { tags: input.tags.length > 0 ? input.tags.join(",") : null } : {}),
      ...(input.resourceType !== undefined ? { resourceType: input.resourceType } : {}),
    },
    select: detailSelect,
  });

  return toResourceDetail(updated);
};

/** S3-B7 — uploader-only version upload; an approved current version stays live during student review. */
export const uploadResourceVersion = async (
  auth: AuthUser,
  id: string,
  file: UploadedFile | undefined,
): Promise<ResourceVersionUploadResult> => {
  if (!file) throw AppError.badRequest("Attach the file to upload", "FILE_REQUIRED");

  const resource = await prisma.resource.findFirst({
    where: { id, uploaderId: auth.userId, deletedAt: null, state: { not: "DELETED" } },
    select: {
      id: true,
      state: true,
      currentVersionId: true,
      currentVersion: { select: { state: true } },
    },
  });

  if (!resource) throw resourceNotFound();

  const policy = uploadPolicy(auth);
  const contentHash = sha256(file.buffer);
  const existingFile = await prisma.physicalFile.findUnique({
    where: { contentHash },
    select: { id: true },
  });

  let physicalFileId = existingFile?.id ?? null;
  let stored: StoredObject | null = null;

  if (!physicalFileId) {
    const newFileId = randomUUID();

    try {
      stored = await storeFile({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileId: newFileId,
      });
    } catch {
      throw storageUnavailable();
    }

    physicalFileId = newFileId;
  }

  const storedFile = stored;
  const storedFileId = physicalFileId;
  const versionState = policy.state;

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (storedFile) {
        await tx.physicalFile.create({
          data: {
            id: storedFileId as string,
            contentHash,
            sizeBytes: BigInt(file.size),
            mimeType: file.mimetype,
            storageProvider: storedFile.provider,
            driveFileId: storedFile.provider === "GOOGLE_DRIVE" ? storedFile.fileId : null,
            driveFolderId: storedFile.folderId,
            driveWebViewLink: storedFile.webViewLink,
            driveWebContentLink: storedFile.webContentLink,
          },
        });
      }

      const latest = await tx.resourceVersion.findFirst({
        where: { resourceId: id },
        orderBy: { versionNo: "desc" },
        select: { versionNo: true },
      });
      const versionNo = (latest?.versionNo ?? 0) + 1;
      const version = await tx.resourceVersion.create({
        data: {
          resourceId: id,
          versionNo,
          physicalFileId: storedFileId,
          state: versionState,
          uploadedById: auth.userId,
        },
      });

      let resourceState = resource.state;
      let isCurrent = false;

      if (versionState === "APPROVED") {
        await tx.resourceVersion.updateMany({
          where: { resourceId: id, id: { not: version.id }, state: "APPROVED" },
          data: { state: "SUPERSEDED" },
        });
        await tx.resource.update({
          where: { id },
          data: { currentVersionId: version.id, state: "APPROVED" },
        });
        resourceState = "APPROVED";
        isCurrent = true;
      } else if (resource.currentVersion?.state !== "APPROVED") {
        await tx.resource.update({ where: { id }, data: { state: "PENDING" } });
        resourceState = "PENDING";
      }

      return {
        id: version.id,
        resourceId: id,
        versionNo,
        state: versionState,
        rejectionReason: null,
        createdAt: version.createdAt.toISOString(),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        isCurrent,
        resourceState,
      };
    });

    return { ...result, deduplicated: Boolean(existingFile) };
  } catch (error) {
    if (storedFile && storedFileId) {
      await removeStoredFile({
        storageProvider: storedFile.provider,
        driveFileId: storedFile.provider === "GOOGLE_DRIVE" ? storedFile.fileId : null,
        id: storedFileId,
      }).catch(() => undefined);
    }

    throw error;
  }
};

/** S3-B7 — history is private to the uploader and moderators in scope. */
export const listResourceVersions = async (
  auth: AuthUser | null,
  id: string,
): Promise<ResourceVersionHistoryItem[]> => {
  if (!auth) throw resourceNotFound();

  const resource = await prisma.resource.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, uploaderId: true, currentVersionId: true },
  });

  if (!resource) throw resourceNotFound();

  if (resource.uploaderId !== auth.userId) {
    try {
      await findModeratable(auth, id);
    } catch (error) {
      if (error instanceof AppError && (error.statusCode === 403 || error.statusCode === 404)) {
        throw resourceNotFound();
      }
      throw error;
    }
  }

  const versions = await prisma.resourceVersion.findMany({
    where: { resourceId: id },
    orderBy: { versionNo: "desc" },
    select: {
      id: true,
      versionNo: true,
      state: true,
      rejectionReason: true,
      createdAt: true,
      physicalFile: { select: { mimeType: true, sizeBytes: true } },
    },
  });

  return versions.map((version) => ({
    id: version.id,
    versionNo: version.versionNo,
    state: version.state,
    rejectionReason: version.rejectionReason,
    createdAt: version.createdAt.toISOString(),
    mimeType: version.physicalFile?.mimeType ?? null,
    sizeBytes: version.physicalFile ? Number(version.physicalFile.sizeBytes) : null,
    isCurrent: version.id === resource.currentVersionId,
  }));
};

/** S4-B3 — publish an owner's approved PRIVATE teacher resource. */
const requirePublisher = (auth: AuthUser): TeacherProfile => {
  if (auth.profile?.kind !== "teacher" || auth.profile.verificationStatus !== "ACTIVE") {
    throw AppError.forbidden("Only a verified teacher can publish resources", "FORBIDDEN_ROLE");
  }

  return auth.profile;
};

const validateGrantSessions = async (departmentId: string, sessionIds: string[]): Promise<void> => {
  const sessions = await prisma.session.findMany({
    where: { id: { in: sessionIds }, departmentId, isActive: true },
    select: { id: true },
  });
  if (sessions.length !== sessionIds.length) {
    throw AppError.badRequest("Every batch must be an active session of the resource's department", "INVALID_SESSIONS");
  }
};

const notifySharedSessions = async (
  tx: Prisma.TransactionClient,
  resource: { id: string; title: string },
  sessionIds: string[],
  actorId: string,
): Promise<void> => {
  if (sessionIds.length === 0) return;

  const recipients = await tx.studentProfile.findMany({
    where: {
      sessionId: { in: sessionIds },
      verificationStatus: "ACTIVE",
      user: { is: { accountStatus: "ACTIVE" } },
    },
    select: { userId: true, sessionId: true, session: { select: { name: true } } },
  });
  const recipientsBySession = new Map<string, { name: string; userIds: string[] }>();

  for (const recipient of recipients) {
    const group = recipientsBySession.get(recipient.sessionId) ?? {
      name: recipient.session.name,
      userIds: [],
    };
    group.userIds.push(recipient.userId);
    recipientsBySession.set(recipient.sessionId, group);
  }

  for (const [sessionId, group] of recipientsBySession) {
    if (!sessionIds.includes(sessionId)) continue;
    await notifyUsers(tx, {
      userIds: group.userIds,
      type: "RESOURCE_SHARED",
      payload: { resourceId: resource.id, resourceTitle: resource.title, sessionName: group.name },
      excludeUserId: actorId,
    });
  }
};

export const publishResource = async (
  auth: AuthUser,
  id: string,
  input: PublishResourceInput,
): Promise<ResourceDetail> => {
  const profile = requirePublisher(auth);

  const resource = await prisma.resource.findFirst({
    where: { id, uploaderId: auth.userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      state: true,
      audience: true,
      departmentId: true,
      collegeId: true,
      currentVersion: { select: { state: true } },
    },
  });

  if (!resource) throw resourceNotFound();
  if (resource.audience !== "PRIVATE") {
    throw AppError.conflict("Only a PRIVATE resource can be published", "RESOURCE_NOT_PRIVATE");
  }
  if (resource.state !== "APPROVED" || resource.currentVersion?.state !== "APPROVED") {
    throw AppError.conflict("Only an approved resource can be published", "RESOURCE_NOT_APPROVED");
  }

  const sessionIds = [...new Set(input.sessionIds ?? [])];
  if (input.audience === "PERMITTED") await validateGrantSessions(resource.departmentId, sessionIds);

  return prisma.$transaction(async (tx) => {
    const moved = await tx.resource.updateMany({
      where: { id, uploaderId: auth.userId, audience: "PRIVATE", state: "APPROVED", deletedAt: null },
      data: { audience: input.audience },
    });
    if (moved.count === 0) {
      throw AppError.conflict("This resource was already published", "RESOURCE_ALREADY_PUBLISHED");
    }

    if (input.audience === "PERMITTED") {
      await tx.resourceBatchGrant.createMany({
        data: sessionIds.map((sessionId) => ({
          resourceId: id,
          sessionId,
          collegeId: resource.collegeId,
          departmentId: resource.departmentId,
          grantedById: auth.userId,
        })),
      });

      await notifySharedSessions(tx, { id, title: resource.title }, sessionIds, auth.userId);
    }

    const updated = await tx.resource.findUniqueOrThrow({ where: { id }, select: detailSelect });
    return toResourceDetail(updated);
  });
};

/** S4-B4 — add batches to a teacher-owned PERMITTED resource. */
export const addResourceGrants = async (
  auth: AuthUser,
  id: string,
  input: AddResourceGrantsInput,
): Promise<ResourceDetail> => {
  requirePublisher(auth);

  const resource = await prisma.resource.findFirst({
    where: { id, uploaderId: auth.userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      audience: true,
      state: true,
      collegeId: true,
      departmentId: true,
      currentVersion: { select: { state: true } },
    },
  });

  if (!resource) throw resourceNotFound();
  if (resource.audience !== "PERMITTED") {
    throw AppError.conflict("Batches can only be added to a PERMITTED resource", "RESOURCE_NOT_PERMITTED");
  }
  if (resource.state !== "APPROVED" || resource.currentVersion?.state !== "APPROVED") {
    throw AppError.conflict("Only an approved resource can be shared", "RESOURCE_NOT_APPROVED");
  }

  const sessionIds = [...new Set(input.sessionIds ?? [])];
  await validateGrantSessions(resource.departmentId, sessionIds);

  return prisma.$transaction(async (tx) => {
    const stillPermitted = await tx.resource.findFirst({
      where: { id, uploaderId: auth.userId, audience: "PERMITTED", state: "APPROVED", deletedAt: null },
      select: { id: true },
    });
    if (!stillPermitted) {
      throw AppError.conflict("This resource is no longer shared with batches", "RESOURCE_NOT_PERMITTED");
    }

    const existing = await tx.resourceBatchGrant.findMany({
      where: { resourceId: id, sessionId: { in: sessionIds } },
      select: { sessionId: true },
    });
    const existingIds = new Set(existing.map((grant) => grant.sessionId));
    const newSessionIds = sessionIds.filter((sessionId) => !existingIds.has(sessionId));

    if (newSessionIds.length > 0) {
      await tx.resourceBatchGrant.createMany({
        data: newSessionIds.map((sessionId) => ({
          resourceId: id,
          sessionId,
          collegeId: resource.collegeId,
          departmentId: resource.departmentId,
          grantedById: auth.userId,
        })),
      });
      await notifySharedSessions(tx, { id, title: resource.title }, newSessionIds, auth.userId);
    }

    return toResourceDetail(await tx.resource.findUniqueOrThrow({ where: { id }, select: detailSelect }));
  });
};

/** S4-B4 — revoking the final grant returns the resource to PRIVATE. */
export const revokeResourceGrant = async (
  auth: AuthUser,
  id: string,
  sessionId: string,
): Promise<ResourceDetail> => {
  requirePublisher(auth);

  const resource = await prisma.resource.findFirst({
    where: { id, uploaderId: auth.userId, deletedAt: null },
    select: { id: true, audience: true },
  });
  if (!resource) throw resourceNotFound();
  if (resource.audience !== "PERMITTED") {
    throw AppError.conflict("Batches can only be revoked from a PERMITTED resource", "RESOURCE_NOT_PERMITTED");
  }

  return prisma.$transaction(async (tx) => {
    const removed = await tx.resourceBatchGrant.deleteMany({ where: { resourceId: id, sessionId } });
    if (removed.count === 0) {
      throw AppError.notFound("The resource is not shared with this batch", "RESOURCE_GRANT_NOT_FOUND");
    }

    const remaining = await tx.resourceBatchGrant.count({ where: { resourceId: id } });
    if (remaining === 0) {
      await tx.resource.update({ where: { id }, data: { audience: "PRIVATE" } });
    }

    return toResourceDetail(await tx.resource.findUniqueOrThrow({ where: { id }, select: detailSelect }));
  });
};

/** S5-B3 — CR / Sub Admin / Platform Admin audience promotion. */
export const promoteResource = async (auth: AuthUser, id: string): Promise<ResourceDetail> => {
  const isAdmin = isPlatformAdmin(auth.roles);
  const subAdminColleges = auth.roles
    .filter((role) => role.role === "SUB_ADMIN" && role.collegeId)
    .map((role) => role.collegeId as string);
  const crRoles = auth.roles.filter((role) => role.role === "CR" || role.role === "CO_CR");

  if (!isAdmin && subAdminColleges.length === 0 && crRoles.length === 0) {
    throw AppError.forbidden("Only a CR, Sub Admin or Platform Admin can promote resources", "FORBIDDEN_ROLE");
  }

  const resource = await prisma.resource.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      uploaderId: true,
      uploaderType: true,
      collegeId: true,
      departmentId: true,
      sessionId: true,
      audience: true,
      state: true,
      currentVersion: { select: { state: true } },
    },
  });
  if (!resource) throw resourceNotFound();

  if (!isAdmin && subAdminColleges.length > 0) {
    if (!subAdminColleges.includes(resource.collegeId)) throw resourceNotFound();
  } else if (!isAdmin) {
    const inOwnBatch = crRoles.some(
      (role) =>
        role.collegeId === resource.collegeId &&
        role.departmentId === resource.departmentId &&
        role.sessionId === resource.sessionId,
    );
    if (
      !inOwnBatch ||
      resource.uploaderType !== "STUDENT" ||
      resource.audience !== "COLLEGE" ||
      resource.uploaderId === auth.userId
    ) {
      throw resourceNotFound();
    }
  }

  if (resource.audience === "PLATFORM") {
    throw AppError.conflict("This resource is already published to PLATFORM", "RESOURCE_ALREADY_PLATFORM");
  }
  if (resource.state !== "APPROVED" || resource.currentVersion?.state !== "APPROVED") {
    throw AppError.conflict("Only an approved resource can be promoted", "RESOURCE_NOT_APPROVED");
  }

  return prisma.$transaction(async (tx) => {
    const moved = await tx.resource.updateMany({
      where: { id, audience: resource.audience, state: "APPROVED", deletedAt: null },
      data: { audience: "PLATFORM", promotedById: auth.userId, promotedAt: new Date() },
    });
    if (moved.count === 0) throw AppError.conflict("This resource was already changed", "RESOURCE_ALREADY_CHANGED");

    if (resource.audience === "PERMITTED") {
      await tx.resourceBatchGrant.deleteMany({ where: { resourceId: id } });
    }

    return toResourceDetail(await tx.resource.findUniqueOrThrow({ where: { id }, select: detailSelect }));
  });
};

/** S5-B3 — Sub Admin / Platform Admin revocation of a PLATFORM resource. */
export const revokePlatformResource = async (auth: AuthUser, id: string): Promise<ResourceDetail> => {
  const isAdmin = isPlatformAdmin(auth.roles);
  const subAdminColleges = auth.roles
    .filter((role) => role.role === "SUB_ADMIN" && role.collegeId)
    .map((role) => role.collegeId as string);

  if (!isAdmin && subAdminColleges.length === 0) {
    throw AppError.forbidden("Only a Sub Admin or Platform Admin can revoke PLATFORM", "FORBIDDEN_ROLE");
  }

  const resource = await prisma.resource.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, collegeId: true, uploaderType: true, audience: true, state: true },
  });
  if (!resource) throw resourceNotFound();
  if (!isAdmin && !subAdminColleges.includes(resource.collegeId)) throw resourceNotFound();
  if (resource.audience !== "PLATFORM") {
    throw AppError.conflict("This resource is not published to PLATFORM", "RESOURCE_NOT_PLATFORM");
  }
  if (resource.state !== "APPROVED") {
    throw AppError.conflict("Only an approved resource can be changed", "RESOURCE_NOT_APPROVED");
  }

  const audience = resource.uploaderType === "STUDENT" ? "COLLEGE" : "PRIVATE";

  return prisma.$transaction(async (tx) => {
    const changed = await tx.resource.updateMany({
      where: { id, audience: "PLATFORM", state: "APPROVED", deletedAt: null },
      data: { audience, promotedById: null, promotedAt: null },
    });
    if (changed.count === 0) throw AppError.conflict("This resource was already changed", "RESOURCE_ALREADY_CHANGED");
    await tx.resourceBatchGrant.deleteMany({ where: { resourceId: id } });

    return toResourceDetail(await tx.resource.findUniqueOrThrow({ where: { id }, select: detailSelect }));
  });
};


/**
 * S3-B4 — reading resources.
 *
 * Browsing always starts from `buildVisibilityWhere` (lib/visibility.ts); detail
 * and download re-check with `buildReadableResourceWhere`, which adds the
 * uploader's own rows and the CR's own batches. Nothing here decides visibility
 * on its own, so the access matrix stays in exactly one file.
 */

const listSelect = {
  id: true,
  title: true,
  description: true,
  tags: true,
  resourceType: true,
  audience: true,
  state: true,
  uploaderType: true,
  createdAt: true,
  updatedAt: true,
  uploader: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  course: { select: { id: true, name: true } },
  currentVersion: {
    select: {
      versionNo: true,
      state: true,
      rejectionReason: true,
      physicalFile: { select: { mimeType: true, sizeBytes: true } },
    },
  },
} as const;

type ListRow = Prisma.ResourceGetPayload<{ select: typeof listSelect }>;

const toListItem = (row: ListRow): ResourceListItem => ({
  id: row.id,
  title: row.title,
  description: row.description,
  tags: parseTags(row.tags),
  resourceType: row.resourceType,
  audience: row.audience,
  state: row.state,
  uploaderType: row.uploaderType,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  uploader: row.uploader,
  department: row.department,
  course: row.course,
  versionNo: row.currentVersion?.versionNo ?? null,
  latestVersionState: row.currentVersion?.state ?? null,
  rejectionReason: row.currentVersion?.rejectionReason ?? null,
  mimeType: row.currentVersion?.physicalFile?.mimeType ?? null,
  sizeBytes: row.currentVersion?.physicalFile ? Number(row.currentVersion.physicalFile.sizeBytes) : null,
});

/** The filters every list shares (course / department / college / type / keyword). */
const buildListFilters = (query: ListResourcesQuery): Prisma.ResourceWhereInput[] => {
  const filters: Prisma.ResourceWhereInput[] = [];

  if (query.courseId) filters.push({ courseId: query.courseId });
  if (query.departmentId) filters.push({ departmentId: query.departmentId });
  if (query.collegeId) filters.push({ collegeId: query.collegeId });
  if (query.resourceType) filters.push({ resourceType: query.resourceType });

  if (query.keyword) {
    // Substring, case-insensitive: title, description and the comma-joined tags.
    filters.push({
      OR: [
        { title: { contains: query.keyword, mode: "insensitive" } },
        { description: { contains: query.keyword, mode: "insensitive" } },
        { tags: { contains: query.keyword, mode: "insensitive" } },
      ],
    });
  }

  return filters;
};

const ownListSelect = {
  ...listSelect,
  versions: {
    orderBy: { versionNo: "desc" },
    take: 1,
    select: { state: true, rejectionReason: true },
  },
} as const;

const toOwnListItem = (row: Prisma.ResourceGetPayload<{ select: typeof ownListSelect }>): ResourceListItem => ({
  ...toListItem(row),
  latestVersionState: row.versions[0]?.state ?? row.currentVersion?.state ?? null,
  rejectionReason: row.versions[0]?.rejectionReason ?? null,
});

const orderByOf = (sort: ListResourcesQuery["sort"]): Prisma.ResourceOrderByWithRelationInput => {
  if (sort === "oldest") return { createdAt: "asc" };
  if (sort === "title") return { title: "asc" };

  return { createdAt: "desc" };
};

const paginate = async (
  where: Prisma.ResourceWhereInput,
  query: ListResourcesQuery,
): Promise<ResourceListResult> => {
  const [total, rows] = await prisma.$transaction([
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      orderBy: orderByOf(query.sort),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: listSelect,
    }),
  ]);

  return {
    items: rows.map(toListItem),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
};

/** `GET /api/v1/resources` — normal browsing (guests included). */
export const listResources = async (
  viewer: Viewer,
  query: ListResourcesQuery,
): Promise<ResourceListResult> =>
  paginate({ AND: [buildVisibilityWhere(viewer), ...buildListFilters(query)] }, query);

/** `GET /api/v1/resources/mine` — the uploader's own rows, any state (S3-F2). */
export const listOwnResources = async (
  viewer: Viewer,
  query: ListOwnResourcesQuery,
): Promise<ResourceListResult> => {
  if (!viewer.userId) {
    throw AppError.unauthorized("Sign in to see your uploads", "NOT_AUTHENTICATED");
  }

  const filters: Prisma.ResourceWhereInput[] = [
    buildOwnUploadsWhere(viewer),
    ...buildListFilters(query),
  ];

  if (query.state) filters.push({ state: query.state });

  const where: Prisma.ResourceWhereInput = { AND: filters };
  const [total, rows] = await prisma.$transaction([
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      orderBy: orderByOf(query.sort),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: ownListSelect,
    }),
  ]);

  return {
    items: rows.map(toOwnListItem),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
};

/** `GET /api/v1/resources/:id` — detail, with own/CR/moderator visibility. */
export const getResourceDetail = async (viewer: Viewer, id: string): Promise<ResourceDetail> => {
  const row = await prisma.resource.findFirst({
    where: { id, ...buildReadableResourceWhere(viewer) },
    select: detailSelect,
  });

  // A row the viewer may not read is indistinguishable from a missing one.
  if (!row) throw AppError.notFound("Resource not found", "RESOURCE_NOT_FOUND");

  const canSeeVersionHistory =
    viewer.userId === row.uploader.id ||
    moderatesResource(viewer, {
      collegeId: row.collegeId,
      departmentId: row.departmentId,
      sessionId: row.sessionId ?? "",
      uploaderType: row.uploaderType,
    });

  return toResourceDetail({
    ...row,
    versions: canSeeVersionHistory ? row.versions : row.versions.filter((version) => version.state === "APPROVED"),
  });
};

/** The MIME types of the upload allow-list (Q2) → the extension the user gets. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "image/png": "png",
  "image/jpeg": "jpg",
};

/** A header-safe name: the resource title plus the stored file's extension. */
export const downloadFileName = (title: string, mimeType: string): string => {
  const base =
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "resource";
  const extension = EXTENSION_BY_MIME[mimeType];

  return extension ? `${base}.${extension}` : base;
};

export interface ResourceDownload {
  stream: Readable;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  versionNo: number;
}

/**
 * `GET /api/v1/resources/:id/download` — proxied bytes (D18 / A.7).
 * The visibility check is the same one the detail page uses, so a REJECTED or
 * PRIVATE row can never be fetched by someone who cannot open it.
 */
export const openResourceDownload = async (viewer: Viewer, id: string): Promise<ResourceDownload> => {
  const row = await prisma.resource.findFirst({
    where: { id, ...buildReadableResourceWhere(viewer) },
    select: {
      title: true,
      currentVersion: {
        select: {
          versionNo: true,
          physicalFile: {
            select: {
              id: true,
              mimeType: true,
              sizeBytes: true,
              storageProvider: true,
              driveFileId: true,
            },
          },
        },
      },
    },
  });

  if (!row) throw AppError.notFound("Resource not found", "RESOURCE_NOT_FOUND");

  const file = row.currentVersion?.physicalFile;

  if (!row.currentVersion || !file) {
    throw AppError.conflict("This resource has no downloadable file", "FILE_NOT_AVAILABLE");
  }

  let stream: Readable;

  try {
    stream = await openStoredFile({
      id: file.id,
      storageProvider: file.storageProvider,
      driveFileId: file.driveFileId,
    });
  } catch {
    throw AppError.serviceUnavailable(
      "The file could not be fetched. Please retry in a moment.",
      "STORAGE_UNAVAILABLE",
    );
  }

  return {
    stream,
    fileName: downloadFileName(row.title, file.mimeType),
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    versionNo: row.currentVersion.versionNo,
  };
};
