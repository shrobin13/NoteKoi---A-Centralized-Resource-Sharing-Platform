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
