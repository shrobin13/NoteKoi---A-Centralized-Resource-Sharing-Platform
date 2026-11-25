import { z } from "zod";

/** Client mirrors of `apps/api/src/module/{college,department,session,course}/*.validation.ts`. */

const nameField = (max: number) =>
  z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(max, "Name is too long");

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Use a date in YYYY-MM-DD format");

export const collegeFormSchema = z.object({
  name: nameField(160),
});

export const departmentFormSchema = z.object({
  name: nameField(160),
});

export const sessionFormSchema = z
  .object({
    departmentId: z.string().min(1, "Select a department"),
    name: nameField(120),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
    message: "The end date must be on or after the start date",
    path: ["endDate"],
  });

export const courseFormSchema = z.object({
  departmentId: z.string().min(1, "Select a department"),
  name: nameField(160),
  description: z.string().trim().max(2000, "Description is too long"),
  semester: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 12),
      "Semester must be between 1 and 12",
    ),
});

/** Search/filter inputs (kept as strings; the API coerces the semester). */
export const courseFilterSchema = z.object({
  search: z.string().trim().max(120, "Search text is too long"),
  semester: z.string(),
});

export type CollegeFormValues = z.infer<typeof collegeFormSchema>;
export type DepartmentFormValues = z.infer<typeof departmentFormSchema>;
export type SessionFormValues = z.infer<typeof sessionFormSchema>;
export type CourseFormValues = z.infer<typeof courseFormSchema>;
