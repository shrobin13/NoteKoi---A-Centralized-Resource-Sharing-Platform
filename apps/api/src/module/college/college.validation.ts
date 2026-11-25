import { z } from "zod";

/** `/colleges` query (S2-B2). `status=all` requires a Platform Admin session. */
export const collegeListQuerySchema = z.object({
  status: z.enum(["active", "all"]).default("active"),
  search: z.string().trim().min(1).max(120).optional(),
});

/** `/colleges/:id` and `/colleges/:id/departments` (S1-B13, S2-B2). */
export const collegeIdParamsSchema = z.object({
  id: z.uuid("Select a valid college"),
});

export const collegeDepartmentParamsSchema = z.object({
  id: z.uuid("Select a valid college"),
  departmentId: z.uuid("Select a valid department"),
});

export const createCollegeSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(160, "Name is too long"),
});

export const updateCollegeSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(160, "Name is too long").optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.isActive !== undefined, {
    message: "Provide a name and/or the isActive flag",
  });

export const adoptDepartmentSchema = z.object({
  departmentId: z.uuid("Select a valid department"),
});

export type CollegeListQueryInput = z.infer<typeof collegeListQuerySchema>;
export type CreateCollegeInput = z.infer<typeof createCollegeSchema>;
export type UpdateCollegeInput = z.infer<typeof updateCollegeSchema>;

