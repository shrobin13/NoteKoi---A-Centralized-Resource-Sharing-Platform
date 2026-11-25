import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkRole } from "../../middleware/checkRole.js";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./session.controller.js";
import {
  createSessionSchema,
  sessionIdParamsSchema,
  sessionListQuerySchema,
  updateSessionSchema,
} from "./session.validation.js";

/**
 * Mounted by routes/index.ts at `/api/v1/sessions`.
 * Reads are public; writes are Platform Admin only (A.4).
 */
export const sessionRouter = Router();

sessionRouter.get("/", optionalAuth, validateRequest({ query: sessionListQuerySchema }), controller.listSessions);
sessionRouter.post(
  "/",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ body: createSessionSchema }),
  controller.createSession,
);

sessionRouter.get("/:id", validateRequest({ params: sessionIdParamsSchema }), controller.getSession);
sessionRouter.patch(
  "/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: sessionIdParamsSchema, body: updateSessionSchema }),
  controller.updateSession,
);
sessionRouter.delete(
  "/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: sessionIdParamsSchema }),
  controller.deleteSession,
);
