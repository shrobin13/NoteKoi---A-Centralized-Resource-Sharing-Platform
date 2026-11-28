import { z } from "zod";

export const adminResourceIdParamsSchema = z.object({
  id: z.uuid("Select a valid resource"),
});

const justification = z.string().trim().min(10, "Justification must be at least 10 characters").max(1000, "Justification is too long");

export const adminUpdateResourceSchema = z
  .object({
    justification,
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
    resourceType: z.string().trim().min(1).max(40).optional(),
    audience: z.enum(["PRIVATE", "COLLEGE", "PERMITTED", "PLATFORM"]).optional(),
    state: z.enum(["PENDING", "IN_REVIEW", "APPROVED", "REJECTED", "DELETED"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "justification"), {
    message: "Provide at least one resource field to override",
  });

export const adminDeleteResourceSchema = z.object({ justification }).strict();

export const auditLogQuerySchema = z.object({
  action: z.string().trim().min(1).max(100).optional(),
  actorId: z.uuid("Select a valid actor").optional(),
  targetType: z.string().trim().min(1).max(100).optional(),
  targetId: z.uuid("Select a valid target").optional(),
  page: z.preprocess((value) => (value === undefined || value === "" ? undefined : value), z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess((value) => (value === undefined || value === "" ? undefined : value), z.coerce.number().int().min(1).max(100).default(20)),
});

export type AdminUpdateResourceInput = z.infer<typeof adminUpdateResourceSchema>;
export type AdminDeleteResourceInput = z.infer<typeof adminDeleteResourceSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
