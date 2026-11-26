import type { Prisma } from "../../../generated/prisma/client.js";
import type { EscalationStatus, ResourceState, VersionState } from "../../../generated/prisma/enums.js";
import { writeAuditLog } from "../../lib/audit.js";
import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { notifyUsers } from "../notification/notification.service.js";
import type {
  ModerationDecision,
  ModerationQueueItem,
  ModerationQueueResult,
  EscalationListResult,
  EscalationView,
} from "./moderation.interface.js";
import type {
  CreateEscalationInput,
  DecideEscalationInput,
  ListEscalationsQuery,
  ModerationQueueQuery,
} from "./moderation.validation.js";

/**
 * S3-B6 — moderation.
 *
 * A student upload lands in PENDING; a CR/Co-CR of that batch opens it
 * (PENDING → IN_REVIEW) and then approves or rejects it with a reason. The
 * decision always moves `resources.state` and the waiting `resource_versions`
 * rows together, writes an append-only audit row, and notifies the uploader
 * through S3-B5's fan-out (never the moderator themself).
 *
 * Scope comes from `auth.roles`, not from the request: a CR only sees their own
 * batch, a Sub Admin their college, a Platform Admin everything.
 */

/** States a moderator can still move. */
const MOVABLE: ResourceState[] = ["PENDING", "IN_REVIEW"];
const MOVABLE_VERSIONS: VersionState[] = ["PENDING", "IN_REVIEW"];

interface CrScope {
  collegeId: string;
  departmentId: string;
  sessionId: string;
}

const crScopes = (auth: AuthUser): CrScope[] =>
  auth.roles.flatMap((role) => {
    if (role.role !== "CR" && role.role !== "CO_CR") return [];
    if (!role.collegeId || !role.departmentId || !role.sessionId) return [];

    return [{ collegeId: role.collegeId, departmentId: role.departmentId, sessionId: role.sessionId }];
  });

const subAdminColleges = (auth: AuthUser): string[] =>
  auth.roles.flatMap((role) => (role.role === "SUB_ADMIN" && role.collegeId ? [role.collegeId] : []));

const rowNotFound = (): AppError => AppError.notFound("Resource not found", "RESOURCE_NOT_FOUND");

const notPending = (state: ResourceState): AppError =>
  AppError.conflict(
    `Only a resource that is waiting for review can be decided (this one is ${state})`,
    "RESOURCE_NOT_PENDING",
  );

/**
 * Resources the caller may moderate. Nobody moderates their own upload — a
 * Platform Admin override is S5-B4's job, not the queue's.
 */
const moderationScope = (auth: AuthUser): Prisma.ResourceWhereInput => {
  const batches = crScopes(auth);
  const colleges = subAdminColleges(auth);

  if (!isPlatformAdmin(auth.roles) && batches.length === 0 && colleges.length === 0) {
    throw AppError.forbidden(
      "Only a CR, Co-CR or Sub Admin can moderate resources",
      "FORBIDDEN_SCOPE",
    );
  }

  const audience: Prisma.ResourceWhereInput[] = [];

  if (!isPlatformAdmin(auth.roles)) {
    if (colleges.length > 0) audience.push({ collegeId: { in: colleges } });
    for (const batch of batches) {
      audience.push({
        collegeId: batch.collegeId,
        departmentId: batch.departmentId,
        sessionId: batch.sessionId,
      });
    }
  }

  return {
    AND: [
      audience.length > 0 ? { OR: audience } : {},
      { uploaderId: { not: auth.userId } },
      { deletedAt: null },
    ],
  };
};

const scopeFilters = (query: ModerationQueueQuery): Prisma.ResourceWhereInput => ({
  ...(query.collegeId ? { collegeId: query.collegeId } : {}),
  ...(query.departmentId ? { departmentId: query.departmentId } : {}),
  ...(query.sessionId ? { sessionId: query.sessionId } : {}),
});

const queueSelect = {
  id: true,
  title: true,
  description: true,
  tags: true,
  resourceType: true,
  audience: true,
  state: true,
  createdAt: true,
  uploader: { select: { id: true, name: true, email: true } },
  course: { select: { id: true, name: true } },
  session: { select: { id: true, name: true } },
  currentVersion: {
    select: {
      versionNo: true,
      state: true,
      physicalFile: { select: { mimeType: true, sizeBytes: true } },
    },
  },
  versions: {
    where: { state: { in: MOVABLE_VERSIONS } },
    orderBy: { versionNo: "desc" },
    take: 1,
    select: {
      versionNo: true,
      state: true,
      physicalFile: { select: { mimeType: true, sizeBytes: true } },
    },
  },
} as const;

const toQueueItem = (row: {
  id: string;
  title: string;
  description: string | null;
  tags: string | null;
  resourceType: string;
  audience: string;
  state: ResourceState;
  createdAt: Date;
  uploader: { id: string; name: string; email: string };
  course: { id: string; name: string };
  session: { id: string; name: string } | null;
  currentVersion: {
    versionNo: number;
    state: ModerationQueueItem["versionState"];
    physicalFile: { mimeType: string; sizeBytes: bigint } | null;
  } | null;
  versions: {
    versionNo: number;
    state: ModerationQueueItem["versionState"];
    physicalFile: { mimeType: string; sizeBytes: bigint } | null;
  }[];
}): ModerationQueueItem => ({
  ...(() => {
    const reviewVersion = row.versions[0] ?? row.currentVersion;

    return {
  id: row.id,
  title: row.title,
  description: row.description,
  tags: row.tags,
  resourceType: row.resourceType,
  audience: row.audience,
  state: row.state,
  versionNo: reviewVersion?.versionNo ?? null,
  versionState: reviewVersion?.state ?? null,
  mimeType: reviewVersion?.physicalFile?.mimeType ?? null,
  sizeBytes: reviewVersion?.physicalFile
    ? Number(reviewVersion.physicalFile.sizeBytes)
    : null,
  createdAt: row.createdAt.toISOString(),
  uploader: row.uploader,
  course: row.course,
  session: row.session,
    };
  })(),
});

/** Finds a row by id *inside* the caller's moderation scope, or 404. */
export const findModeratable = async (auth: AuthUser, id: string) => {
  const row = await prisma.resource.findFirst({
    where: { AND: [moderationScope(auth), { id }] },
    select: {
      id: true,
      title: true,
      state: true,
      audience: true,
      uploaderId: true,
      currentVersion: { select: { id: true, state: true } },
      versions: {
        where: { state: { in: MOVABLE_VERSIONS } },
        select: { id: true, versionNo: true, state: true },
      },
      session: { select: { name: true } },
    },
  });

  if (!row) throw rowNotFound();

  return row;
};

/** GET /api/v1/moderation/queue — oldest first, so nothing starves. */
export const listModerationQueue = async (
  auth: AuthUser,
  query: ModerationQueueQuery,
): Promise<ModerationQueueResult> => {
  const queueState: Prisma.ResourceWhereInput = query.state
    ? { OR: [{ state: query.state }, { versions: { some: { state: query.state } } }] }
    : {
        OR: [
          { state: { in: MOVABLE } },
          { versions: { some: { state: { in: MOVABLE_VERSIONS } } } },
        ],
      };
  const where: Prisma.ResourceWhereInput = {
    AND: [
      moderationScope(auth),
      queueState,
      scopeFilters(query),
    ],
  };

  const [total, rows] = await prisma.$transaction([
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: queueSelect,
    }),
  ]);

  return {
    items: rows.map((row) => toQueueItem(row)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
};

/** POST /api/v1/moderation/resources/:id/open — PENDING → IN_REVIEW. */
export const openForReview = async (
  auth: AuthUser,
  id: string,
): Promise<{ id: string; state: ResourceState; versionState: VersionState; previousState: ResourceState }> => {
  const resource = await findModeratable(auth, id);

  if (resource.state === "IN_REVIEW" || resource.versions.some((version) => version.state === "IN_REVIEW")) {
    throw AppError.conflict("This resource is already under review", "RESOURCE_ALREADY_IN_REVIEW");
  }

  if (!MOVABLE.includes(resource.state) && !resource.versions.some((version) => version.state === "PENDING")) {
    throw notPending(resource.state);
  }

  await prisma.$transaction(async (tx) => {
    const movedVersions = await tx.resourceVersion.updateMany({
      where: { resourceId: id, state: "PENDING" },
      data: { state: "IN_REVIEW" },
    });

    if (movedVersions.count === 0) {
      throw AppError.conflict("This resource is already under review", "RESOURCE_ALREADY_IN_REVIEW");
    }

    if (resource.state === "PENDING") {
      const movedResource = await tx.resource.updateMany({
        where: { id, state: "PENDING" },
        data: { state: "IN_REVIEW" },
      });

      if (movedResource.count === 0) {
        throw AppError.conflict("This resource is already under review", "RESOURCE_ALREADY_IN_REVIEW");
      }
    }

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "REVIEW_STARTED",
      targetType: "RESOURCE",
      targetId: id,
      metadata: { previousState: "PENDING", audience: resource.audience },
    });
  });

  return { id, state: "IN_REVIEW", versionState: "IN_REVIEW", previousState: resource.state };
};

/**
 * The one place a decision is written: `resources.state`, every waiting
 * `resource_versions` row, the audit row and the uploader's notification commit
 * together or not at all.
 */
const decide = async (
  auth: AuthUser,
  id: string,
  decision: "APPROVED" | "REJECTED",
  reason: string | null,
): Promise<ModerationDecision> => {
  const resource = await findModeratable(auth, id);

  if (
    !MOVABLE.includes(resource.state) &&
    !resource.versions.some((version) => MOVABLE_VERSIONS.includes(version.state))
  ) {
    throw notPending(resource.state);
  }

  const decidedAt = new Date();

  const version = await prisma.$transaction(async (tx) => {
    if (MOVABLE.includes(resource.state)) {
      const moved = await tx.resource.updateMany({
        where: { id, state: { in: MOVABLE } },
        data: { state: decision },
      });

      if (moved.count === 0) {
        throw AppError.conflict("This resource was already decided", "RESOURCE_ALREADY_DECIDED");
      }
    }

    const movedVersions = await tx.resourceVersion.updateMany({
      where: { resourceId: id, state: { in: MOVABLE_VERSIONS } },
      data: { state: decision, rejectionReason: decision === "REJECTED" ? reason : null },
    });

    if (movedVersions.count === 0) {
      throw AppError.conflict("This resource was already decided", "RESOURCE_ALREADY_DECIDED");
    }

    if (decision === "APPROVED") {
      const currentVersion = await tx.resourceVersion.findFirst({
        where: { resourceId: id, state: "APPROVED" },
        orderBy: { versionNo: "desc" },
        select: { id: true, versionNo: true },
      });

      if (!currentVersion) {
        throw AppError.conflict("The approved resource version could not be found", "RESOURCE_VERSION_NOT_FOUND");
      }

      await tx.resourceVersion.updateMany({
        where: { resourceId: id, state: "APPROVED", versionNo: { lt: currentVersion.versionNo } },
        data: { state: "SUPERSEDED" },
      });

      await tx.resource.update({
        where: { id },
        data: {
          currentVersionId: currentVersion.id,
          ...(MOVABLE.includes(resource.state) ? { state: "APPROVED" } : {}),
        },
      });
    }

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: decision === "APPROVED" ? "RESOURCE_APPROVED" : "RESOURCE_REJECTED",
      targetType: "RESOURCE",
      targetId: id,
      justification: decision === "REJECTED" ? reason : null,
      metadata: { previousState: resource.state, audience: resource.audience },
    });

    await notifyUsers(tx, {
      userIds: [resource.uploaderId],
      type: decision === "APPROVED" ? "RESOURCE_APPROVED" : "RESOURCE_REJECTED",
      payload: {
        resourceId: id,
        resourceTitle: resource.title,
        ...(resource.session ? { sessionName: resource.session.name } : {}),
        ...(decision === "REJECTED" && reason ? { reason } : {}),
      },
      excludeUserId: auth.userId,
    });

    return tx.resourceVersion.findFirst({
      where: { resourceId: id },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true, state: true },
    });
  });

  return {
    id,
    state: MOVABLE.includes(resource.state) ? decision : resource.state,
    versionNo: version?.versionNo ?? null,
    versionState: version?.state ?? null,
    previousState: resource.state,
    reason,
    decidedAt: decidedAt.toISOString(),
  };
};

/** POST /api/v1/moderation/resources/:id/approve */
export const approveResource = (auth: AuthUser, id: string): Promise<ModerationDecision> =>
  decide(auth, id, "APPROVED", null);

/** POST /api/v1/moderation/resources/:id/reject — the reason reaches the uploader. */
export const rejectResource = (
  auth: AuthUser,
  id: string,
  reason: string,
): Promise<ModerationDecision> => decide(auth, id, "REJECTED", reason);

const escalationSelect = {
  id: true,
  resourceId: true,
  reportId: true,
  deletionRequestId: true,
  reason: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  escalatedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  resource: {
    select: {
      id: true,
      title: true,
      audience: true,
      uploader: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
    },
  },
  report: { select: { id: true, reason: true, status: true } },
  deletionRequest: { select: { id: true, reason: true, status: true } },
} as const;

type EscalationRow = Prisma.ModerationEscalationGetPayload<{ select: typeof escalationSelect }>;

const toEscalationView = (row: EscalationRow): EscalationView => ({
  id: row.id,
  resourceId: row.resourceId,
  reportId: row.reportId,
  deletionRequestId: row.deletionRequestId,
  reason: row.reason,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  escalatedBy: row.escalatedBy,
  assignedTo: row.assignedTo,
  resource: row.resource,
  report: row.report,
  deletionRequest: row.deletionRequest,
});

const escalationNotFound = (): AppError => AppError.notFound("Escalation not found", "ESCALATION_NOT_FOUND");

const activeSubAdminId = async (collegeId: string): Promise<string> => {
  const subAdmin = await prisma.userRole.findFirst({
    where: {
      role: "SUB_ADMIN",
      collegeId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { userId: true },
  });
  if (!subAdmin) throw AppError.conflict("This college has no active Sub Admin to receive the escalation", "SUB_ADMIN_NOT_FOUND");
  return subAdmin.userId;
};

const findEscalatableReport = async (auth: AuthUser, reportId: string) => {
  const scopes = crScopes(auth);
  if (scopes.length === 0) {
    throw AppError.forbidden("Only a CR or Co-CR can escalate a report", "FORBIDDEN_SCOPE");
  }

  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      status: "PENDING",
      resource: {
        OR: scopes.map((scope) => ({
          ...scope,
          uploaderType: "STUDENT",
          uploaderId: { not: auth.userId },
          deletedAt: null,
        })),
      },
    },
    select: { id: true, resourceId: true, resource: { select: { collegeId: true } } },
  });
  if (!report) throw AppError.notFound("Report not found", "REPORT_NOT_FOUND");
  return report;
};

const findEscalatableDeletion = async (auth: AuthUser, deletionRequestId: string) => {
  const scopes = crScopes(auth);
  if (scopes.length === 0) {
    throw AppError.forbidden("Only a CR or Co-CR can escalate a deletion request", "FORBIDDEN_SCOPE");
  }

  const deletionRequest = await prisma.deletionRequest.findFirst({
    where: {
      id: deletionRequestId,
      status: "PENDING",
      resource: {
        OR: scopes.map((scope) => ({
          ...scope,
          uploaderType: "STUDENT",
          uploaderId: { not: auth.userId },
          deletedAt: null,
        })),
      },
    },
    select: { id: true, resourceId: true, resource: { select: { collegeId: true } } },
  });
  if (!deletionRequest) throw AppError.notFound("Deletion request not found", "DELETION_REQUEST_NOT_FOUND");
  return deletionRequest;
};

export const createEscalation = async (auth: AuthUser, input: CreateEscalationInput): Promise<EscalationView> => {
  if (input.reportId) {
    const report = await findEscalatableReport(auth, input.reportId);
    const assignedToId = await activeSubAdminId(report.resource.collegeId);
    const existing = await prisma.moderationEscalation.findFirst({
      where: { reportId: report.id, status: "OPEN" },
      select: { id: true },
    });
    if (existing) throw AppError.conflict("This report is already escalated", "ESCALATION_ALREADY_OPEN");

    const escalation = await prisma.moderationEscalation.create({
      data: {
        resourceId: report.resourceId,
        reportId: report.id,
        escalatedById: auth.userId,
        assignedToId,
        reason: input.reason,
      },
      select: escalationSelect,
    });
    return toEscalationView(escalation);
  }

  const deletionRequestId = input.deletionRequestId;
  if (!deletionRequestId) throw AppError.badRequest("Select a report or deletion request", "ESCALATION_SOURCE_REQUIRED");
  const deletionRequest = await findEscalatableDeletion(auth, deletionRequestId);
  const assignedToId = await activeSubAdminId(deletionRequest.resource.collegeId);
  const existing = await prisma.moderationEscalation.findFirst({
    where: { deletionRequestId: deletionRequest.id, status: "OPEN" },
    select: { id: true },
  });
  if (existing) throw AppError.conflict("This deletion request is already escalated", "ESCALATION_ALREADY_OPEN");

  const escalation = await prisma.moderationEscalation.create({
    data: {
      resourceId: deletionRequest.resourceId,
      deletionRequestId: deletionRequest.id,
      escalatedById: auth.userId,
      assignedToId,
      reason: input.reason,
    },
    select: escalationSelect,
  });
  return toEscalationView(escalation);
};

const escalationListWhere = (auth: AuthUser): Prisma.ModerationEscalationWhereInput => {
  if (isPlatformAdmin(auth.roles)) return {};
  if (subAdminColleges(auth).length > 0) return { assignedToId: auth.userId };
  if (crScopes(auth).length > 0) return { escalatedById: auth.userId };

  throw AppError.forbidden("Only a CR, Sub Admin or Platform Admin can view escalations", "FORBIDDEN_SCOPE");
};

export const listEscalations = async (
  auth: AuthUser,
  query: ListEscalationsQuery,
): Promise<EscalationListResult> => {
  const where: Prisma.ModerationEscalationWhereInput = {
    AND: [escalationListWhere(auth), { status: query.status }],
  };
  const [total, rows] = await prisma.$transaction([
    prisma.moderationEscalation.count({ where }),
    prisma.moderationEscalation.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: escalationSelect,
    }),
  ]);

  return {
    items: rows.map(toEscalationView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
};

export const decideEscalation = async (
  auth: AuthUser,
  id: string,
  input: DecideEscalationInput,
): Promise<EscalationView> => {
  const canResolve = isPlatformAdmin(auth.roles) || subAdminColleges(auth).length > 0;
  if (!canResolve) throw AppError.forbidden("Only a Sub Admin or Platform Admin can resolve escalations", "FORBIDDEN_SCOPE");

  const escalation = await prisma.moderationEscalation.findFirst({
    where: { id, ...(isPlatformAdmin(auth.roles) ? {} : { assignedToId: auth.userId }) },
    select: { id: true, resourceId: true, reportId: true, deletionRequestId: true, status: true },
  });
  if (!escalation) throw escalationNotFound();
  if (escalation.status !== "OPEN") {
    throw AppError.conflict("This escalation has already been decided", "ESCALATION_ALREADY_DECIDED");
  }

  const reportDecision = escalation.reportId !== null;
  if (reportDecision && input.decision !== "RESOLVED" && input.decision !== "DISMISSED") {
    throw AppError.badRequest("Report escalations must be resolved or dismissed", "INVALID_ESCALATION_DECISION");
  }
  if (!reportDecision && input.decision !== "APPROVED" && input.decision !== "DENIED") {
    throw AppError.badRequest("Deletion escalations must be approved or denied", "INVALID_ESCALATION_DECISION");
  }

  const resolvedAt = new Date();
  const finalStatus: EscalationStatus =
    input.decision === "RESOLVED" || input.decision === "APPROVED" ? "RESOLVED" : "DISMISSED";

  return prisma.$transaction(async (tx) => {
    if (escalation.reportId) {
      const reportStatus = input.decision === "RESOLVED" ? "RESOLVED" : "DISMISSED";
      const changed = await tx.report.updateMany({
        where: { id: escalation.reportId, status: "PENDING" },
        data: { status: reportStatus, resolvedById: auth.userId, resolvedAt },
      });
      if (changed.count === 0) throw AppError.conflict("The report was already decided", "REPORT_ALREADY_DECIDED");
    } else if (escalation.deletionRequestId) {
      const requestStatus = input.decision === "APPROVED" ? "APPROVED" : "DENIED";
      const deletionRequest = await tx.deletionRequest.findUniqueOrThrow({
        where: { id: escalation.deletionRequestId },
        select: { requesterId: true, resource: { select: { id: true, title: true } } },
      });
      const changed = await tx.deletionRequest.updateMany({
        where: { id: escalation.deletionRequestId, status: "PENDING" },
        data: { status: requestStatus, decidedById: auth.userId, decidedAt: resolvedAt },
      });
      if (changed.count === 0) throw AppError.conflict("The deletion request was already decided", "DELETION_REQUEST_ALREADY_DECIDED");

      if (requestStatus === "APPROVED") {
        const deleted = await tx.resource.updateMany({
          where: { id: escalation.resourceId, state: "APPROVED", deletedAt: null },
          data: { state: "DELETED", deletedById: auth.userId, deletedAt: resolvedAt },
        });
        if (deleted.count === 0) throw AppError.conflict("The resource is no longer available", "RESOURCE_NOT_DELETABLE");
      }

      await notifyUsers(tx, {
        userIds: [deletionRequest.requesterId],
        type: requestStatus === "APPROVED" ? "DELETION_APPROVED" : "DELETION_DENIED",
        payload: {
          resourceId: deletionRequest.resource.id,
          resourceTitle: deletionRequest.resource.title,
          ...(requestStatus === "DENIED" ? { reason: "The deletion request was denied after escalation." } : {}),
        },
        excludeUserId: auth.userId,
      });
    }

    const changed = await tx.moderationEscalation.updateMany({
      where: { id, status: "OPEN" },
      data: { status: finalStatus, resolvedAt },
    });
    if (changed.count === 0) throw AppError.conflict("This escalation has already been decided", "ESCALATION_ALREADY_DECIDED");

    return toEscalationView(await tx.moderationEscalation.findUniqueOrThrow({ where: { id }, select: escalationSelect }));
  });
};

