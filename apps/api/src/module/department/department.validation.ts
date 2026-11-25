import { z } from "zod";

/** `/departments/:id/sessions` (S1-B13) and `/departments/:id` (S2-B1). */
export const departmentIdParamsSchema = z.object({
  id: z.uuid("Select a valid department"),
});

/** `/departments` query (S2-B1). `status=all` requires a Platform Admin session. */
export const departmentListQuerySchema = z.object({
  status: z.enum(["active", "all"]).default("active"),
  search: z.string().trim().min(1).max(120).optional(),
  collegeId: z.uuid("Select a valid college").optional(),
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(160, "Name is too long"),
});

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(160, "Name is too long").optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: "Provide a name and/or the isActive flag",
  });

export type DepartmentListQueryInput = z.infer<typeof departmentListQuerySchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

