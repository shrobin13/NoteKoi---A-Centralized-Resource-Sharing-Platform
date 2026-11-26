import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./deletion.controller.js";
import {
  deleteResourceSchema,
  deletionRequestIdParamsSchema,
  listDeletionRequestsQuerySchema,
  resourceIdParamsSchema,
} from "./deletion.validation.js";

export const deletionRouter = Router();

deletionRouter.post(
  "/resources/:id",
  checkAuth,
  validateRequest({ params: resourceIdParamsSchema, body: deleteResourceSchema }),
  controller.requestOrDeleteResource,
);
deletionRouter.get(
  "/requests",
  checkAuth,
  validateRequest({ query: listDeletionRequestsQuerySchema }),
  controller.listDeletionRequests,
);
deletionRouter.post(
  "/requests/:id/approve",
  checkAuth,
  validateRequest({ params: deletionRequestIdParamsSchema }),
  controller.approveDeletionRequest,
);
deletionRouter.post(
  "/requests/:id/deny",
  checkAuth,
  validateRequest({ params: deletionRequestIdParamsSchema }),
  controller.denyDeletionRequest,
);