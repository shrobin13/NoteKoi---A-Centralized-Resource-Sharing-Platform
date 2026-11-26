import type { Prisma } from "../../../generated/prisma/client.js";
import type { DeletionRequestStatus, ResourceState } from "../../../generated/prisma/enums.js";
import { writeAuditLog } from "../../lib/audit.js";
import { isClassRepresentative, isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { prisma } from "../../lib/prisma.js";
import { notifyUsers } from "../notification/notification.service.js";
import { AppError } from "../../utils/AppError.js";
import type { DeletionActionResult, DeletionRequestListResult, DeletionRequestView } from "./deletion.interface.js";
import type { DeleteResourceInput, ListDeletionRequestsQuery } from "./deletion.validation.js";

const deletionRequestSelect = {
  id: true,
  resourceId: true,
  reason: true,
  status: true,
  createdAt: true,
  decidedAt: true,
  requester: { select: { id: true, name: true, email: true } },
  decidedBy: { select: { id: true, name: true } },
  resource: {
    select: {
      id: true,
      title: true,
      state: true,
      audience: true,
      uploader: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
    },
  },
} as const;

type DeletionRequestRow = Prisma.DeletionRequestGetPayload<{ select: typeof deletionRequestSelect }>;

const toDeletionRequestView = (row: DeletionRequestRow): DeletionRequestView => ({
  id: row.id,
  resourceId: row.resourceId,
  reason: row.reason,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt?.toISOString() ?? null,
  requester: row.requester,
  decidedBy: row.decidedBy,
  resource: row.resource,
});

const resourceNotFound = (): AppError => AppError.notFound("Resource not found", "RESOURCE_NOT_FOUND");
const requestNotFound = (): AppError => AppError.notFound("Deletion request not found", "DELETION_REQUEST_NOT_FOUND");

const requestScope = (auth: AuthUser): Prisma.DeletionRequestWhereInput => {
  if (isPlatformAdmin(auth.roles)) return { resource: { deletedAt: null } };

  const scopes: Prisma.DeletionRequestWhereInput[] = [];

  for (const role of auth.roles) {
    if ((role.role === "CR" || role.role === "CO_CR") && role.collegeId && role.departmentId && role.sessionId) {
      scopes.push({
        resource: {
          uploaderType: "STUDENT",
          uploaderId: { not: auth.userId },
          collegeId: role.collegeId,
          departmentId: role.departmentId,
          sessionId: role.sessionId,
          deletedAt: null,
        },
      });
    }
    if (role.role === "SUB_ADMIN" && role.collegeId) {
      scopes.push({ resource: { uploaderType: "STUDENT", collegeId: role.collegeId, deletedAt: null } });
    }
  }

  if (scopes.length === 0) {
    throw AppError.forbidden("Only a CR, Co-CR, Sub Admin or Platform Admin can review deletion requests", "FORBIDDEN_SCOPE");
  }

  return { OR: scopes };
};

const softDelete = async (
  auth: AuthUser,
  resource: { id: string; title: string; state: ResourceState; audience: string; collegeId: string; departmentId: string; sessionId: string | null },
  fanOutToBatch: boolean,
  auditTeacherDelete: boolean,
): Promise<void> => {
  const deletedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.resource.updateMany({
      where: { id: resource.id, uploaderId: auth.userId, state: { not: "DELETED" }, deletedAt: null },
      data: { state: "DELETED", deletedById: auth.userId, deletedAt },
    });
    if (updated.count === 0) {
      throw AppError.conflict("This resource has already been deleted", "RESOURCE_ALREADY_DELETED");
    }

    if (fanOutToBatch && resource.sessionId) {
      const students = await tx.studentProfile.findMany({
        where: {
          collegeId: resource.collegeId,
          departmentId: resource.departmentId,
          sessionId: resource.sessionId,
          verificationStatus: "ACTIVE",
          user: { is: { accountStatus: "ACTIVE" } },
        },
        select: { userId: true },
      });
      await notifyUsers(tx, {
        userIds: students.map((student) => student.userId),
        type: "RESOURCE_DELETED",
        payload: { resourceId: resource.id, resourceTitle: resource.title },
        excludeUserId: auth.userId,
      });
    }

    if (auditTeacherDelete) {
      await writeAuditLog(tx, {
        actorId: auth.userId,
        action: "TEACHER_RESOURCE_DELETED",
        targetType: "RESOURCE",
        targetId: resource.id,
        metadata: { audience: resource.audience, previousState: resource.state },
      });
    }
  });
};

export const requestOrDeleteResource = async (
  auth: AuthUser,
  id: string,
  input: DeleteResourceInput,
): Promise<DeletionActionResult> => {
  const profile = auth.profile;
  if (!profile || profile.verificationStatus !== "ACTIVE") {
    throw AppError.forbidden("Only a verified profile can delete or request deletion", "PROFILE_NOT_ACTIVE");
  }

  const resource = await prisma.resource.findFirst({
    where: { id, uploaderId: auth.userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      state: true,
      audience: true,
      uploaderType: true,
      collegeId: true,
      departmentId: true,
      sessionId: true,
      deletionFlaggedAt: true,
    },
  });
  if (!resource) throw resourceNotFound();

  if (profile.kind === "teacher") {
    await softDelete(auth, resource, false, true);
    return { resourceId: id, action: "DELETED", state: "DELETED" };
  }

  if (isClassRepresentative(auth.roles)) {
    await softDelete(auth, resource, true, false);
    return { resourceId: id, action: "DELETED", state: "DELETED" };
  }

  if (resource.state === "PENDING") {
    await softDelete(auth, resource, false, false);
    return { resourceId: id, action: "CANCELED", state: "DELETED" };
  }

  if (resource.state === "IN_REVIEW") {
    if (resource.deletionFlaggedAt) {
      throw AppError.conflict("Deletion has already been flagged for this resource", "DELETION_ALREADY_FLAGGED");
    }
    const flagged = await prisma.resource.updateMany({
      where: { id, uploaderId: auth.userId, state: "IN_REVIEW", deletionFlaggedAt: null },
      data: { deletionFlaggedById: auth.userId, deletionFlaggedAt: new Date() },
    });
    if (flagged.count === 0) {
      throw AppError.conflict("Deletion has already been flagged for this resource", "DELETION_ALREADY_FLAGGED");
    }
    return { resourceId: id, action: "FLAGGED", state: "IN_REVIEW" };
  }

  if (resource.state !== "APPROVED") {
    throw AppError.conflict("This resource cannot be deleted in its current state", "RESOURCE_NOT_DELETABLE");
  }
  if (!input.reason) {
    throw AppError.badRequest("Provide a reason for the deletion request", "DELETION_REASON_REQUIRED");
  }

  const existing = await prisma.deletionRequest.findFirst({
    where: { resourceId: id, requesterId: auth.userId, status: "PENDING" },
    select: { id: true },
  });
  if (existing) throw AppError.conflict("A deletion request is already pending", "DELETION_REQUEST_EXISTS");

  const deletionRequest = await prisma.deletionRequest.create({
    data: { resourceId: id, requesterId: auth.userId, reason: input.reason },
    select: { id: true },
  });

  return { resourceId: id, action: "REQUESTED", state: "APPROVED", requestId: deletionRequest.id };
};

export const listDeletionRequests = async (
  auth: AuthUser,
  query: ListDeletionRequestsQuery,
): Promise<DeletionRequestListResult> => {
  const where: Prisma.DeletionRequestWhereInput = {
    AND: [requestScope(auth), { status: query.status }],
  };
  const [total, rows] = await prisma.$transaction([
    prisma.deletionRequest.count({ where }),
    prisma.deletionRequest.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: deletionRequestSelect,
    }),
  ]);

  return {
    items: rows.map(toDeletionRequestView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
};

const decideDeletionRequest = async (
  auth: AuthUser,
  id: string,
  status: Extract<DeletionRequestStatus, "APPROVED" | "DENIED">,
): Promise<DeletionRequestView> => {
  const request = await prisma.deletionRequest.findFirst({
    where: { AND: [requestScope(auth), { id }] },
    select: { id: true, resourceId: true, requesterId: true, reason: true, status: true, resource: { select: { title: true } } },
  });
  if (!request) throw requestNotFound();
  if (request.status !== "PENDING") {
    throw AppError.conflict("This deletion request has already been decided", "DELETION_REQUEST_ALREADY_DECIDED");
  }

  const decidedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const changed = await tx.deletionRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status, decidedById: auth.userId, decidedAt },
    });
    if (changed.count === 0) {
      throw AppError.conflict("This deletion request has already been decided", "DELETION_REQUEST_ALREADY_DECIDED");
    }

    if (status === "APPROVED") {
      const deleted = await tx.resource.updateMany({
        where: { id: request.resourceId, state: "APPROVED", deletedAt: null },
        data: { state: "DELETED", deletedById: auth.userId, deletedAt: decidedAt },
      });
      if (deleted.count === 0) {
        throw AppError.conflict("The resource is no longer available for deletion", "RESOURCE_NOT_DELETABLE");
      }
    }

    await notifyUsers(tx, {
      userIds: [request.requesterId],
      type: status === "APPROVED" ? "DELETION_APPROVED" : "DELETION_DENIED",
      payload: {
        resourceId: request.resourceId,
        resourceTitle: request.resource.title,
        ...(status === "DENIED" ? { reason: request.reason } : {}),
      },
      excludeUserId: auth.userId,
    });

    return toDeletionRequestView(
      await tx.deletionRequest.findUniqueOrThrow({ where: { id }, select: deletionRequestSelect }),
    );
  });
};

export const approveDeletionRequest = (auth: AuthUser, id: string): Promise<DeletionRequestView> =>
  decideDeletionRequest(auth, id, "APPROVED");

export const denyDeletionRequest = (auth: AuthUser, id: string): Promise<DeletionRequestView> =>
  decideDeletionRequest(auth, id, "DENIED");