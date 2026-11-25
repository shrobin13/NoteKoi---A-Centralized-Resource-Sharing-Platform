import { z } from "zod";

const verificationStatus = z.enum(["PENDING_VERIFICATION", "ACTIVE", "REJECTED"]);

/** `PATCH /users/me` (S2-B5). Email changes are out of scope for v1. */
export const updateMeSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
});

/**
 * `PATCH /users/me/student-profile` (S2-B5).
 * Changing college/department/session/regNo re-opens verification; the
 * `includeOtherColleges` toggle alone does not.
 */
export const updateStudentProfileSchema = z
  .object({
    collegeId: z.uuid("Select a valid college").optional(),
    departmentId: z.uuid("Select a valid department").optional(),
    sessionId: z.uuid("Select a valid session").optional(),
    regNo: z.string().trim().min(1, "Registration number is required").max(40, "Registration number is too long").optional(),
    includeOtherColleges: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

/** `GET /users/verification/students` and `.../teachers` (S2-B5). */
export const verificationListQuerySchema = z.object({
  status: verificationStatus.default("PENDING_VERIFICATION"),
  collegeId: z.uuid("Select a valid college").optional(),
  departmentId: z.uuid("Select a valid department").optional(),
  sessionId: z.uuid("Select a valid session").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** `POST .../students/:profileId/reject` and `.../teachers/:profileId/reject`. */
export const rejectVerificationSchema = z.object({
  reason: z.string().trim().min(5, "Give the reason (at least 5 characters)").max(500, "Reason is too long"),
});

export const profileIdParamsSchema = z.object({
  profileId: z.uuid("Select a valid profile"),
});

/** `PUT /users/teachers/:profileId/departments` (S2-B6). */
export const teacherDepartmentsSchema = z.object({
  departmentIds: z
    .array(z.uuid("Select valid departments"))
    .min(1, "Pick at least one department")
    .max(20, "Too many departments")
    .refine((ids) => new Set(ids).size === ids.length, { message: "Departments must be unique" }),
});

/** A role expiry must still be in the future (A.2: expired roles are inactive). */
const futureDate = (message: string) =>
  z.coerce.date().refine((value) => value.getTime() > Date.now(), { message });

/** `GET /users/students` and `GET /users/teachers` (S2-B6 directories). */
export const peopleListQuerySchema = z.object({
  collegeId: z.uuid("Select a valid college").optional(),
  departmentId: z.uuid("Select a valid department").optional(),
  sessionId: z.uuid("Select a valid session").optional(),
  q: z.string().trim().max(120, "Search text is too long").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** `GET /users/roles` (S2-B6). */
export const roleListQuerySchema = z.object({
  role: z.enum(["CR", "CO_CR", "SUB_ADMIN"]).optional(),
  collegeId: z.uuid("Select a valid college").optional(),
  departmentId: z.uuid("Select a valid department").optional(),
  sessionId: z.uuid("Select a valid session").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** `POST /users/roles` — Sub Admin appoints a CR or Co-CR of one batch (S2-B6). */
export const appointCrSchema = z.object({
  userId: z.uuid("Select a valid student"),
  role: z.enum(["CR", "CO_CR"]),
  collegeId: z.uuid("Select a valid college"),
  departmentId: z.uuid("Select a valid department"),
  sessionId: z.uuid("Select a valid session"),
  expiresAt: futureDate("The expiry must be in the future").optional(),
  reason: z.string().trim().max(300, "Reason is too long").optional(),
});

/** `POST /users/roles/sub-admin` — Platform Admin appoints a Sub Admin (S2-B6). */
export const appointSubAdminSchema = z
  .object({
    userId: z.uuid("Select a valid teacher"),
    collegeId: z.uuid("Select a valid college"),
    emergency: z.boolean().default(false),
    expiresAt: futureDate("The expiry must be in the future").optional(),
    reason: z.string().trim().max(500, "Reason is too long").optional(),
  })
  .refine((value) => !value.emergency || (value.reason ?? "").trim().length >= 5, {
    message: "An emergency replacement needs a justification (at least 5 characters)",
    path: ["reason"],
  });

/** `POST /users/roles/:roleId/revoke` (S2-B6). */
export const revokeRoleSchema = z.object({
  reason: z.string().trim().min(5, "Give the reason (at least 5 characters)").max(500, "Reason is too long"),
});

export const roleIdParamsSchema = z.object({
  roleId: z.uuid("Select a valid role assignment"),
});

export type AppointCrInput = z.infer<typeof appointCrSchema>;
export type AppointSubAdminInput = z.infer<typeof appointSubAdminSchema>;
export type AssignTeacherDepartmentsInput = z.infer<typeof teacherDepartmentsSchema>;
export type PeopleListQueryInput = z.infer<typeof peopleListQuerySchema>;
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>;
export type RevokeRoleInput = z.infer<typeof revokeRoleSchema>;
export type RoleListQueryInput = z.infer<typeof roleListQuerySchema>;
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;
export type VerificationListQueryInput = z.infer<typeof verificationListQuerySchema>;
