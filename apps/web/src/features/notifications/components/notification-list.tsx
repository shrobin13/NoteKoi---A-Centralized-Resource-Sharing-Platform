"use client";

import { Bell, ChevronLeft, ChevronRight, ExternalLink, MailOpen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../hooks";
import type { NotificationItem, NotificationType } from "../types";

const notificationTitle: Record<NotificationType, string> = {
  RESOURCE_APPROVED: "Resource approved",
  RESOURCE_REJECTED: "Resource needs changes",
  RESOURCE_SHARED: "Resource shared with your batch",
  RESOURCE_DELETED: "Resource deleted",
  DELETION_APPROVED: "Deletion request approved",
  DELETION_DENIED: "Deletion request denied",
};

const detailText = (item: NotificationItem): string => {
  const parts: string[] = [];
  if (item.payload.resourceTitle) parts.push(item.payload.resourceTitle);
  if (item.payload.sessionName) parts.push(`Shared with ${item.payload.sessionName}`);
  if (item.payload.reason) parts.push(item.payload.reason);
  return parts.join(" · ");
};

export function NotificationList() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notifications = useNotifications(page, unreadOnly);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const onMarkRead = async (id: string) => {
    try {
      await markRead.mutateAsync(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark notification read");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description={notifications.data ? `${notifications.data.unread} unread` : "Updates about your resources"}
        actions={
          <Button type="button" variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending || !notifications.data?.unread}>
            <MailOpen aria-hidden /> Mark all read
          </Button>
        }
      />

      <label className="flex w-fit items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(event) => {
            setUnreadOnly(event.target.checked);
            setPage(1);
          }}
          className="size-4 accent-foreground"
        />
        Unread only
      </label>

      {notifications.isPending ? <LoadingState label="Loading notifications…" /> : null}
      {notifications.isError ? (
        <ErrorState
          title="Could not load notifications"
          description={notifications.error instanceof Error ? notifications.error.message : undefined}
          onRetry={() => void notifications.refetch()}
        />
      ) : null}
      {notifications.data?.items.length === 0 ? (
        <EmptyState title={unreadOnly ? "No unread notifications" : "You are all caught up"} />
      ) : null}

      <ul className="flex flex-col gap-2">
        {notifications.data?.items.map((item) => (
          <li key={item.id}>
            <NotificationRow item={item} busy={markRead.isPending} onMarkRead={() => void onMarkRead(item.id)} />
          </li>
        ))}
      </ul>

      {notifications.data && notifications.data.totalPages > 1 ? (
        <nav aria-label="Notification pages" className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1 || notifications.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-28 text-center text-sm text-muted-foreground">Page {notifications.data.page} of {notifications.data.totalPages}</span>
          <Button type="button" variant="outline" size="icon" aria-label="Next page" disabled={page >= notifications.data.totalPages || notifications.isFetching} onClick={() => setPage((value) => Math.min(notifications.data?.totalPages ?? value, value + 1))}>
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

function NotificationRow({ item, busy, onMarkRead }: { item: NotificationItem; busy: boolean; onMarkRead: () => void }) {
  const text = detailText(item);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Bell className={`mt-0.5 size-4 shrink-0 ${item.readAt ? "text-muted-foreground" : "text-foreground"}`} aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{notificationTitle[item.type]}</p>
              {!item.readAt ? <Badge variant="warning">New</Badge> : null}
            </div>
            {text ? <p className="mt-1 break-words text-sm text-muted-foreground">{text}</p> : null}
            <time className="mt-2 block text-xs text-muted-foreground" dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleString()}
            </time>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:pl-4">
          {item.payload.resourceId ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/resources/${item.payload.resourceId}`}>
                View resource <ExternalLink aria-hidden />
              </Link>
            </Button>
          ) : null}
          {!item.readAt ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onMarkRead}>Mark read</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}