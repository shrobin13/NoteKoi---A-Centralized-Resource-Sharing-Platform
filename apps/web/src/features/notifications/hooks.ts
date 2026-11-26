"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "./api";
import type { NotificationPage } from "./types";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (page: number, unreadOnly: boolean) => ["notifications", "list", page, unreadOnly] as const,
  unreadCount: ["notifications", "unread-count"] as const,
};

export const useNotifications = (page: number, unreadOnly: boolean) =>
  useQuery<NotificationPage>({
    queryKey: notificationKeys.list(page, unreadOnly),
    queryFn: ({ signal }) => fetchNotifications({ page, pageSize: 20, unreadOnly }, signal),
  });

export const useUnreadNotificationCount = (enabled: boolean) =>
  useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: async () => (await fetchNotifications({ page: 1, pageSize: 1 })).unread,
    enabled,
    staleTime: 15_000,
  });

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
};

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: ({ updated }) => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(updated === 0 ? "No unread notifications" : "All notifications marked read");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not mark notifications read");
    },
  });
};