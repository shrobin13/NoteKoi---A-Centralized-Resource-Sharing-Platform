import type { Prisma } from "../../../generated/prisma/client.js";
import type { NotificationType } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
  NotificationListResult,
  NotificationPayload,
  NotificationView,
} from "./notification.interface.js";
import type { ListNotificationsQuery } from "./notification.validation.js";

/**
 * S3-B5 — notifications.
 *
 * A.6 allows six events (resource shared / approved / rejected / deleted / restored,
 * deletion denied) and only students receive them, so this module owns two things:
 * the read + mark-as-read endpoints, and the fan-out helper every trigger uses.
 */

/** Both `prisma` and a `prisma.$transaction` client satisfy this. */
type NotificationWriter = Pick<typeof prisma, "notification">;

export interface NotificationEntry {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
}

const jsonPayload = (payload: NotificationPayload): Prisma.InputJsonValue =>
  payload as unknown as Prisma.InputJsonValue;

/**
 * Bulk insert to be called **inside** the transaction that made the change, so a
 * notification can never describe something that did not commit. Entries are
 * de-duplicated per `(user, type)` because `createMany` would happily write the
 * same row twice.
 */
export const createNotifications = async (
  writer: NotificationWriter,
  entries: NotificationEntry[],
): Promise<number> => {
  if (entries.length === 0) return 0;

  const unique = [...new Map(entries.map((entry) => [`${entry.userId}:${entry.type}`, entry])).values()];

  const result = await writer.notification.createMany({
    data: unique.map((entry) => ({
      userId: entry.userId,
      type: entry.type,
      payload: jsonPayload(entry.payload),
    })),
  });

  return result.count;
};

/** Fan-out helper: one event to many users, de-duplicated, never back to the actor. */
export const notifyUsers = async (
  writer: NotificationWriter,
  input: {
    userIds: string[];
    type: NotificationType;
    payload: NotificationPayload;
    /** The CR who deleted a file or the teacher who shared it. */
    excludeUserId?: string;
  },
): Promise<number> =>
  createNotifications(
    writer,
    [...new Set(input.userIds)]
      .filter((userId) => userId !== input.excludeUserId)
      .map((userId) => ({ userId, type: input.type, payload: input.payload })),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface NotificationRow {
  id: string;
  type: NotificationType;
  payload: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}

const toView = (row: NotificationRow): NotificationView => ({
  id: row.id,
  type: row.type,
  payload: isRecord(row.payload) ? (row.payload as NotificationPayload) : {},
  readAt: row.readAt ? row.readAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

const rowSelect = { id: true, type: true, payload: true, readAt: true, createdAt: true } as const;

export const listNotifications = async (
  userId: string,
  query: ListNotificationsQuery,
): Promise<NotificationListResult> => {
  const { page, pageSize, unreadOnly } = query;
  const where: Prisma.NotificationWhereInput = { userId, ...(unreadOnly ? { readAt: null } : {}) };

  const [total, unread, rows] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: rowSelect,
    }),
  ]);

  return {
    items: rows.map(toView),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
    unread,
  };
};

/** Marking an already-read row is a no-op, not an error — the UI retries freely. */
export const markNotificationRead = async (userId: string, id: string): Promise<NotificationView> => {
  const existing = await prisma.notification.findFirst({ where: { id, userId }, select: rowSelect });

  if (!existing) throw AppError.notFound("Notification not found", "NOTIFICATION_NOT_FOUND");

  if (existing.readAt) return toView(existing);

  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
    select: rowSelect,
  });

  return toView(updated);
};

/** Returns how many rows flipped, so the badge can be updated without a refetch. */
export const markAllNotificationsRead = async (userId: string): Promise<number> => {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return result.count;
};
