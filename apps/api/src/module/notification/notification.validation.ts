import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** `?unreadOnly=true|false` — anything else falls through to zod's error. */
const booleanFlag = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;

  return value;
}, z.boolean().default(false));

export const notificationIdParamsSchema = z.object({
  id: z.uuid("Select a valid notification"),
});

/** S3-B5 — `GET /notifications`. The badge and the page share this shape. */
export const listNotificationsQuerySchema = z.object({
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(20)),
  unreadOnly: booleanFlag,
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
