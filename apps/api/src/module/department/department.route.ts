import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkRole } from "../../middleware/checkRole.js";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./department.controller.js";
import {
  createDepartmentSchema,
  departmentIdParamsSchema,
  departmentListQuerySchema,
  updateDepartmentSchema,
} from "./department.validation.js";

/**
 * Mounted by routes/index.ts at `/api/v1/departments`.
 * Reads are public; writes are Platform Admin only (A.4).
 */
export const departmentRouter = Router();

departmentRouter.get(
  "/",
  optionalAuth,
  validateRequest({ query: departmentListQuerySchema }),
  controller.listDepartments,
);
departmentRouter.post(
  "/",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ body: createDepartmentSchema }),
  controller.createDepartment,
);

departmentRouter.get("/:id", validateRequest({ params: departmentIdParamsSchema }), controller.getDepartment);
departmentRouter.patch(
  "/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: departmentIdParamsSchema, body: updateDepartmentSchema }),
  controller.updateDepartment,
);
departmentRouter.delete(
  "/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: departmentIdParamsSchema }),
  controller.deleteDepartment,
);

departmentRouter.get(
  "/:id/sessions",
  validateRequest({ params: departmentIdParamsSchema }),
  controller.listSessions,
);

