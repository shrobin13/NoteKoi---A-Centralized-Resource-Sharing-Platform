import { z } from "zod";

export const SESSION_DATE_MESSAGE = "Use a date in YYYY-MM-DD format";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, SESSION_DATE_MESSAGE);

export const sessionIdParamsSchema = z.object({
  id: z.uuid("Select a valid session"),
});

/** `/sessions` query (S2-B3). `status=all` requires a Platform Admin session. */
export const sessionListQuerySchema = z.object({
  departmentId: z.uuid("Select a valid department").optional(),
  status: z.enum(["active", "all"]).default("active"),
  search: z.string().trim().min(1).max(120).optional(),
});

export const createSessionSchema = z
  .object({
    departmentId: z.uuid("Select a valid department"),
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: "The end date must be on or after the start date",
    path: ["endDate"],
  });

export const updateSessionSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(120, "Name is too long").optional(),
    startDate: dateOnly.nullable().optional(),
    endDate: dateOnly.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

export type SessionListQueryInput = z.infer<typeof sessionListQuerySchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
