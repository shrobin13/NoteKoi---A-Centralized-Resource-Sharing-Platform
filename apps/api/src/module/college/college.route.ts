import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkRole } from "../../middleware/checkRole.js";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./college.controller.js";
import {
  adoptDepartmentSchema,
  collegeDepartmentParamsSchema,
  collegeIdParamsSchema,
  collegeListQuerySchema,
  createCollegeSchema,
  updateCollegeSchema,
} from "./college.validation.js";

/**
 * Mounted by routes/index.ts at `/api/v1/colleges`.
 * Reads are public (active rows only); writes are Platform Admin only (A.4).
 */
export const collegeRouter = Router();

collegeRouter.get("/", optionalAuth, validateRequest({ query: collegeListQuerySchema }), controller.listColleges);
collegeRouter.get("/:id", validateRequest({ params: collegeIdParamsSchema }), controller.getCollege);
collegeRouter.get(
  "/:id/departments",
  validateRequest({ params: collegeIdParamsSchema }),
  controller.listDepartments,
);

collegeRouter.post(
  "/",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ body: createCollegeSchema }),
  controller.createCollege,
);
collegeRouter.patch(
  "/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: collegeIdParamsSchema, body: updateCollegeSchema }),
  controller.updateCollege,
);
collegeRouter.delete(
  "/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: collegeIdParamsSchema }),
  controller.deleteCollege,
);

collegeRouter.post(
  "/:id/departments",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: collegeIdParamsSchema, body: adoptDepartmentSchema }),
  controller.adoptDepartment,
);
collegeRouter.delete(
  "/:id/departments/:departmentId",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: collegeDepartmentParamsSchema }),
  controller.dropDepartment,
);

