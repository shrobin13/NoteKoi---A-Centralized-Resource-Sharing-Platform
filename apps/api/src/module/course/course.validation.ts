import { z } from "zod";

export const courseIdParamsSchema = z.object({
  id: z.uuid("Select a valid course"),
});

/** `/courses` query (S2-B4). `status=all` requires a Platform Admin session. */
export const courseListQuerySchema = z.object({
  departmentId: z.uuid("Select a valid department").optional(),
  status: z.enum(["active", "all"]).default("active"),
  search: z.string().trim().min(1).max(120).optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
});

const courseName = z.string().trim().min(2, "Name must be at least 2 characters").max(160, "Name is too long");
const courseDescription = z.string().trim().max(2000, "Description is too long");
const courseSemester = z.number().int().min(1, "Semester must be between 1 and 12").max(12, "Semester must be between 1 and 12");

export const createCourseSchema = z.object({
  departmentId: z.uuid("Select a valid department"),
  name: courseName,
  description: courseDescription.optional(),
  semester: courseSemester.optional(),
});

export const updateCourseSchema = z
  .object({
    name: courseName.optional(),
    description: courseDescription.nullable().optional(),
    semester: courseSemester.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

export type CourseListQueryInput = z.infer<typeof courseListQuerySchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
