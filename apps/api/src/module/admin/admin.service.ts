import type { Prisma } from "../../../generated/prisma/client.js";
import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { writeAuditLog, listAuditLogs as readAuditLogs, type AuditLogListResult } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { AdminOverrideResult, AdminResourceView } from "./admin.interface.js";
import type { AdminDeleteResourceInput, AdminUpdateResourceInput, AuditLogQuery } from "./admin.validation.js";

const requirePlatformAdmin = (auth: AuthUser): void => {
  if (!isPlatformAdmin(auth.roles)) {
    throw AppError.forbidden("Only a Platform Admin can use governance overrides", "FORBIDDEN_ROLE");
  }
};

const resourceNotFound = (): AppError => AppError.notFound("Resource not found", "RESOURCE_NOT_FOUND");

const selectResource = {
  id: true,
  title: true,
  description: true,
  tags: true,
  resourceType: true,
  audience: true,
  state: true,
  uploaderId: true,
  currentVersionId: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ResourceRow = Prisma.ResourceGetPayload<{ select: typeof selectResource }>;

const toView = (row: ResourceRow): AdminResourceView => ({
  id: row.id,
  title: row.title,
  description: row.description,
  tags: row.tags ? row.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
  resourceType: row.resourceType,
  audience: row.audience,
  state: row.state,
  uploaderId: row.uploaderId,
  currentVersionId: row.currentVersionId,
  deletedAt: row.deletedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const updateResourceOverride = async (
  auth: AuthUser,
  id: string,
  input: AdminUpdateResourceInput,
): Promise<AdminOverrideResult> => {
  requirePlatformAdmin(auth);

  const current = await prisma.resource.findUnique({ where: { id }, select: selectResource });
  if (!current) throw resourceNotFound();

  const { justification, ...fields } = input;
  const data: Prisma.ResourceUpdateInput = {
    ...(fields.title !== undefined ? { title: fields.title } : {}),
    ...(fields.description !== undefined ? { description: fields.description } : {}),
    ...(fields.tags !== undefined ? { tags: fields.tags.length > 0 ? fields.tags.join(",") : null } : {}),
    ...(fields.resourceType !== undefined ? { resourceType: fields.resourceType } : {}),
    ...(fields.audience !== undefined ? { audience: fields.audience } : {}),
    ...(fields.state !== undefined ? { state: fields.state } : {}),
  };

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.resource.update({ where: { id }, data, select: selectResource });
    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "PLATFORM_RESOURCE_OVERRIDE",
      targetType: "RESOURCE",
      targetId: id,
      justification,
      metadata: {
        previousState: current.state,
        nextState: fields.state ?? current.state,
        previousAudience: current.audience,
        nextAudience: fields.audience ?? current.audience,
      },
    });
    return updated;
  });

  return { resource: toView(result), action: "RESOURCE_UPDATED" };
};

export const deleteResourceOverride = async (
  auth: AuthUser,
  id: string,
  input: { justification: string },
): Promise<AdminOverrideResult> => {
  requirePlatformAdmin(auth);

  const current = await prisma.resource.findUnique({ where: { id }, select: selectResource });
  if (!current) throw resourceNotFound();
  if (current.state === "DELETED" || current.deletedAt) {
    throw AppError.conflict("This resource is already deleted", "RESOURCE_ALREADY_DELETED");
  }

  const deletedAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.resource.update({
      where: { id },
      data: { state: "DELETED", deletedById: auth.userId, deletedAt },
      select: selectResource,
    });
    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "PLATFORM_RESOURCE_SOFT_DELETE",
      targetType: "RESOURCE",
      targetId: id,
      justification: input.justification,
      metadata: { previousState: current.state, previousAudience: current.audience },
    });
    return updated;
  });

  return { resource: toView(result), action: "RESOURCE_SOFT_DELETED" };
};

export const listAuditLogs = async (auth: AuthUser, query: AuditLogQuery): Promise<AuditLogListResult> => {
  requirePlatformAdmin(auth);
  return readAuditLogs({
    page: query.page,
    pageSize: query.pageSize,
    action: query.action,
    actorId: query.actorId,
    targetType: query.targetType,
    targetId: query.targetId,
  });
};
