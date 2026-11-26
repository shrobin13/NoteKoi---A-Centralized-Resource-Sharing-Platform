import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./notification.controller.js";
import { listNotificationsQuerySchema, notificationIdParamsSchema } from "./notification.validation.js";

/**
 * Mounted by routes/index.ts at `/api/v1/notifications`.
 *
 * Everything here is "my own rows", so a session is the only permission needed:
 * the user id always comes from the session, never from the URL or body.
 */
export const notificationRouter = Router();

notificationRouter.use(checkAuth);

notificationRouter.get(
  "/",
  validateRequest({ query: listNotificationsQuerySchema }),
  controller.listNotifications,
);

notificationRouter.post("/read-all", controller.markAllNotificationsRead);

notificationRouter.post(
  "/:id/read",
  validateRequest({ params: notificationIdParamsSchema }),
  controller.markNotificationRead,
);
