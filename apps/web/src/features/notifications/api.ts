import { apiPost, apiRequest, toQueryString } from "@/lib/api";
import type { NotificationItem, NotificationPage } from "./types";

export const fetchNotifications = async (
  params: { page: number; pageSize: number; unreadOnly?: boolean },
  signal?: AbortSignal,
): Promise<NotificationPage> => {
  const response = await apiRequest<NotificationItem[]>(`/notifications${toQueryString(params)}`, { signal });
  const numberMeta = (key: string, fallback: number): number =>
    typeof response.meta[key] === "number" ? (response.meta[key] as number) : fallback;

  return {
    items: response.data,
    page: numberMeta("page", params.page),
    pageSize: numberMeta("pageSize", params.pageSize),
    total: numberMeta("total", response.data.length),
    totalPages: numberMeta("totalPages", response.data.length > 0 ? 1 : 0),
    unread: numberMeta("unread", 0),
  };
};

export const markNotificationRead = async (id: string): Promise<NotificationItem> =>
  (await apiPost<NotificationItem>(`/notifications/${id}/read`, {})).data;

export const markAllNotificationsRead = async (): Promise<{ updated: number }> =>
  (await apiPost<{ updated: number }>("/notifications/read-all", {})).data;