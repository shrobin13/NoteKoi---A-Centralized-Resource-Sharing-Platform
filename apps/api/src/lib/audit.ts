import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "./prisma.js";

/**
 * S2-B6 — audit writer (used by role appointments now, moderation in S5-B4).
 *
 * `audit_logs` is append-only and is the record reviewers trust, so every
 * privileged change goes through this helper. Pass the transaction client when
 * the change and its audit row must commit together.
 */
export interface AuditEntry {
  actorId: string;
  /** e.g. `ROLE_APPOINTED`, `ROLE_REVOKED`, `SUB_ADMIN_EMERGENCY_REPLACEMENT`. */
  action: string;
  /** e.g. `USER`, `RESOURCE`, `ROLE`. */
  targetType: string;
  targetId: string;
  /** Mandatory for overrides (emergency appointments, admin deletions). */
  justification?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}

/** Both `prisma` and a `prisma.$transaction` client satisfy this. */
type AuditWriter = Pick<typeof prisma, "auditLog">;

export const writeAuditLog = async (writer: AuditWriter, entry: AuditEntry): Promise<void> => {
  await writer.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      justification: entry.justification ?? null,
      metadata: entry.metadata ?? undefined,
    },
  });
};

export interface AuditLogView {
  id: string;
  actorId: string;
  actor: { id: string; name: string; email: string };
  action: string;
  targetType: string;
  targetId: string;
  justification: string | null;
  metadata: Prisma.JsonValue;
  createdAt: string;
}

export interface AuditLogListResult {
  items: AuditLogView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const listAuditLogs = async (input: {
  page: number;
  pageSize: number;
  action?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
}): Promise<AuditLogListResult> => {
  const where: Prisma.AuditLogWhereInput = {
    ...(input.action ? { action: { contains: input.action, mode: "insensitive" } } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        actorId: true,
        actor: { select: { id: true, name: true, email: true } },
        action: true,
        targetType: true,
        targetId: true,
        justification: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actor: row.actor,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      justification: row.justification,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
};
