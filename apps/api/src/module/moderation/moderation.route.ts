import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./moderation.controller.js";
import {
  createEscalationSchema,
  decideEscalationSchema,
  escalationIdParamsSchema,
  listEscalationsQuerySchema,
  moderationQueueQuerySchema,
  moderationResourceIdParamsSchema,
  rejectResourceSchema,
} from "./moderation.validation.js";


/**
 * Mounted by routes/index.ts at `/api/v1/moderation` (S3-B6).
 *
 * Every route is signed-in only; the *role* check lives in the service so a
 * student gets 403 `FORBIDDEN_SCOPE` rather than an empty queue, and a CR that
 * reaches for another batch's resource gets the same 404 as a stranger.
 */
export const moderationRouter = Router();

moderationRouter.post(
  "/escalations",
  checkAuth,
  validateRequest({ body: createEscalationSchema }),
  controller.createEscalation,
);
moderationRouter.get(
  "/escalations",
  checkAuth,
  validateRequest({ query: listEscalationsQuerySchema }),
  controller.listEscalations,
);
moderationRouter.post(
  "/escalations/:id/decide",
  checkAuth,
  validateRequest({ params: escalationIdParamsSchema, body: decideEscalationSchema }),
  controller.decideEscalation,
);

moderationRouter.get(
  "/queue",
  checkAuth,
  validateRequest({ query: moderationQueueQuerySchema }),
  controller.listQueue,
);

moderationRouter.post(
  "/resources/:id/open",
  checkAuth,
  validateRequest({ params: moderationResourceIdParamsSchema }),
  controller.openForReview,
);

moderationRouter.post(
  "/resources/:id/approve",
  checkAuth,
  validateRequest({ params: moderationResourceIdParamsSchema }),
  controller.approveResource,
);

moderationRouter.post(
  "/resources/:id/reject",
  checkAuth,
  validateRequest({ params: moderationResourceIdParamsSchema, body: rejectResourceSchema }),
  controller.rejectResource,
);
