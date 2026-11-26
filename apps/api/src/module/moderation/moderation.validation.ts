import { z } from "zod";

/**
 * S3-B6 — moderation inputs.
 *
 * The queue only ever shows work that is still movable (`PENDING` / `IN_REVIEW`),
 * so `state` is a filter, not a free-form search: APPROVED/REJECTED rows live in
 * the resource list, not in a moderator's inbox.
 */
export const moderationQueueQuerySchema = z.object({
  state: z.enum(["PENDING", "IN_REVIEW"]).optional(),
  collegeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ModerationQueueQuery = z.infer<typeof moderationQueueQuerySchema>;

export const moderationResourceIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ModerationResourceIdParams = z.infer<typeof moderationResourceIdParamsSchema>;

/** A rejection must say why — the uploader reads this in the notification and S3-F2. */
export const rejectResourceSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Give the uploader at least a sentence")
    .max(500, "Keep the reason under 500 characters"),
});

export type RejectResourceInput = z.infer<typeof rejectResourceSchema>;

export const escalationIdParamsSchema = z.object({ id: z.uuid("Select a valid escalation") });

export const createEscalationSchema = z
  .object({
    reportId: z.uuid("Select a valid report").optional(),
    deletionRequestId: z.uuid("Select a valid deletion request").optional(),
    reason: z.string().trim().min(10, "Explain the escalation in at least 10 characters").max(500),
  })
  .refine((value) => Boolean(value.reportId) !== Boolean(value.deletionRequestId), {
    message: "Escalate exactly one report or deletion request",
  });

export const listEscalationsQuerySchema = z.object({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const decideEscalationSchema = z.object({
  decision: z.enum(["RESOLVED", "DISMISSED", "APPROVED", "DENIED"]),
});

export type CreateEscalationInput = z.infer<typeof createEscalationSchema>;
export type ListEscalationsQuery = z.infer<typeof listEscalationsQuerySchema>;
export type DecideEscalationInput = z.infer<typeof decideEscalationSchema>;
