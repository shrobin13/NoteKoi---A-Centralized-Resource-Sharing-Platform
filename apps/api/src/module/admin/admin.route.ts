import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkRole } from "../../middleware/checkRole.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./admin.controller.js";
import {
  adminDeleteResourceSchema,
  adminResourceIdParamsSchema,
  adminUpdateResourceSchema,
  auditLogQuerySchema,
} from "./admin.validation.js";

export const adminRouter = Router();

adminRouter.get(
  "/audit-logs",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ query: auditLogQuerySchema }),
  controller.listAuditLogs,
);

adminRouter.patch(
  "/resources/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: adminResourceIdParamsSchema, body: adminUpdateResourceSchema }),
  controller.updateResourceOverride,
);

adminRouter.delete(
  "/resources/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: adminResourceIdParamsSchema, body: adminDeleteResourceSchema }),
  controller.deleteResourceOverride,
);
