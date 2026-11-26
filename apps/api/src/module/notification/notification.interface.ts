import type { NotificationType } from "../../../generated/prisma/enums.js";

/**
 * S3-B5 — the `payload` of a notification row.
 *
 * A.6 allows exactly six events and every one of them is about a resource, so the
 * payload carries the resource (and, for a rejection/denial, the reason). Keeping
 * it to these fields means the UI never has to guess why a row exists.
 */
export interface NotificationPayload {
  resourceId?: string;
  resourceTitle?: string;
  /** RESOURCE_REJECTED / DELETION_DENIED only. */
  reason?: string;
  /** RESOURCE_SHARED only: the batch the file was published to. */
  sessionName?: string;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  items: NotificationView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Unread rows of this user, independent of the current page. */
  unread: number;
}
