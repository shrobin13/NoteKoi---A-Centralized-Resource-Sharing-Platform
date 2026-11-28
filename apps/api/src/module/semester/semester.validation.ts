import { z } from "zod";

const semesterName = z.string().trim().min(2, "Semester name must be at least 2 characters").max(80);
const courseName = z.string().trim().min(2, "Course name must be at least 2 characters").max(160);
const categoryName = z.string().trim().min(2, "Category name must be at least 2 characters").max(80);

export const semesterIdParamsSchema = z.object({ id: z.uuid("Select a valid semester") });
export const semesterCourseIdParamsSchema = z.object({ id: z.uuid("Select a valid semester course") });
export const categoryParamsSchema = z.object({ semesterCourseId: z.uuid(), categoryId: z.uuid() });

export const createSemesterSchema = z.object({ name: semesterName });
export const updateSemesterSchema = z.object({ name: semesterName });
export const addSemesterCourseSchema = z.object({
  courseId: z.uuid().optional(),
  courseName: courseName.optional(),
  teacherProfileId: z.uuid().nullable().optional(),
  semesterNumber: z.number().int().min(1).max(12).optional(),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.courseName), {
  message: "Provide either courseId or courseName",
});
export const updateSemesterCourseSchema = z.object({
  courseName: courseName.optional(),
  teacherProfileId: z.uuid().nullable().optional(),
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: "Provide a course name or teacher",
});
export const createCategorySchema = z.object({ name: categoryName });
export const updateCategorySchema = z.object({ name: categoryName });

export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;
export type UpdateSemesterInput = z.infer<typeof updateSemesterSchema>;
export type AddSemesterCourseInput = z.infer<typeof addSemesterCourseSchema>;
export type UpdateSemesterCourseInput = z.infer<typeof updateSemesterCourseSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
