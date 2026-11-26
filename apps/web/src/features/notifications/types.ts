export type NotificationType =
  | "RESOURCE_APPROVED"
  | "RESOURCE_REJECTED"
  | "RESOURCE_SHARED"
  | "RESOURCE_DELETED"
  | "DELETION_APPROVED"
  | "DELETION_DENIED";

export interface NotificationPayload {
  resourceId?: string;
  resourceTitle?: string;
  reason?: string;
  sessionName?: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unread: number;
}