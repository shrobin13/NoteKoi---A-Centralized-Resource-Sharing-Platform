import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkRole } from "../../middleware/checkRole.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./user.controller.js";
import {
  appointCrSchema,
  appointSubAdminSchema,
  peopleListQuerySchema,
  profileIdParamsSchema,
  rejectVerificationSchema,
  revokeRoleSchema,
  roleIdParamsSchema,
  roleListQuerySchema,
  teacherDepartmentsSchema,
  updateMeSchema,
  updateStudentProfileSchema,
  verificationListQuerySchema,
} from "./user.validation.js";

/**
 * Mounted by routes/index.ts at `/api/v1/users`.
 *
 * Student registrations are decided by the CR/Co-CR of that batch (S2-B5);
 * teacher registrations and department assignment by the Sub Admin of the
 * college (S2-B6). A Platform Admin passes every role check (A.4).
 * Fine-grained scope (which batch / which college) is enforced in the service.
 */
export const userRouter = Router();

userRouter.use(checkAuth);

// Self service.
userRouter.get("/me", controller.getMe);
userRouter.patch("/me", validateRequest({ body: updateMeSchema }), controller.updateMe);
userRouter.patch(
  "/me/student-profile",
  validateRequest({ body: updateStudentProfileSchema }),
  controller.updateStudentProfile,
);

// Student verification queue (CR queue).
userRouter.get(
  "/verification/students",
  checkRole("CR", "CO_CR"),
  validateRequest({ query: verificationListQuerySchema }),
  controller.listStudentVerifications,
);
userRouter.post(
  "/verification/students/:profileId/approve",
  checkRole("CR", "CO_CR"),
  validateRequest({ params: profileIdParamsSchema }),
  controller.approveStudent,
);
userRouter.post(
  "/verification/students/:profileId/reject",
  checkRole("CR", "CO_CR"),
  validateRequest({ params: profileIdParamsSchema, body: rejectVerificationSchema }),
  controller.rejectStudent,
);

// Teacher verification queue (Sub Admin queue).
userRouter.get(
  "/verification/teachers",
  checkRole("SUB_ADMIN"),
  validateRequest({ query: verificationListQuerySchema }),
  controller.listTeacherVerifications,
);
userRouter.post(
  "/verification/teachers/:profileId/approve",
  checkRole("SUB_ADMIN"),
  validateRequest({ params: profileIdParamsSchema }),
  controller.approveTeacher,
);
userRouter.post(
  "/verification/teachers/:profileId/reject",
  checkRole("SUB_ADMIN"),
  validateRequest({ params: profileIdParamsSchema, body: rejectVerificationSchema }),
  controller.rejectTeacher,
);

// Teacher department assignment (Sub Admin of that college).
userRouter.put(
  "/teachers/:profileId/departments",
  checkRole("SUB_ADMIN"),
  validateRequest({ params: profileIdParamsSchema, body: teacherDepartmentsSchema }),
  controller.assignTeacherDepartments,
);

// ── S2-B6: role management ─────────────────────────────────────────────────
// Directories the appointment screens read (Sub Admin: own college(s)).
userRouter.get(
  "/students",
  checkRole("SUB_ADMIN"),
  validateRequest({ query: peopleListQuerySchema }),
  controller.listStudents,
);
userRouter.get(
  "/teachers",
  checkRole("SUB_ADMIN"),
  validateRequest({ query: peopleListQuerySchema }),
  controller.listTeachers,
);

// CR / Co-CR appointment and revocation (Sub Admin of that college).
userRouter.get(
  "/roles",
  checkRole("SUB_ADMIN"),
  validateRequest({ query: roleListQuerySchema }),
  controller.listRoles,
);
userRouter.post(
  "/roles",
  checkRole("SUB_ADMIN"),
  validateRequest({ body: appointCrSchema }),
  controller.appointCr,
);
userRouter.post(
  "/roles/:roleId/revoke",
  checkRole("SUB_ADMIN"),
  validateRequest({ params: roleIdParamsSchema, body: revokeRoleSchema }),
  controller.revokeRole,
);

// Sub Admin appointment / emergency replacement (Platform Admin only).
userRouter.post(
  "/roles/sub-admin",
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ body: appointSubAdminSchema }),
  controller.appointSubAdmin,
);
