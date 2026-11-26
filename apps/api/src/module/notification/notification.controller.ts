import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as notificationService from "./notification.service.js";
import type { ListNotificationsQuery } from "./notification.validation.js";

type NotificationParams = { id: string };

/** GET /api/v1/notifications — own rows, newest first, unread count in `meta`. */
export const listNotifications: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, ListNotificationsQuery>(res);
  const result = await notificationService.listNotifications(requireAuth(req).userId, query);

  sendResponse(res, {
    message: "Notifications loaded",
    data: result.items,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
      unread: result.unread,
    },
  });
};

/** POST /api/v1/notifications/:id/read — idempotent. */
export const markNotificationRead: RequestHandler = async (req, res) => {
  const { params } = getValidated<unknown, unknown, NotificationParams>(res);
  const notification = await notificationService.markNotificationRead(requireAuth(req).userId, params.id);

  sendResponse(res, { message: "Notification read", data: notification });
};

/** POST /api/v1/notifications/read-all — clears the badge in a single update. */
export const markAllNotificationsRead: RequestHandler = async (req, res) => {
  const updated = await notificationService.markAllNotificationsRead(requireAuth(req).userId);

  sendResponse(res, { message: "All notifications read", data: { updated } });
};
