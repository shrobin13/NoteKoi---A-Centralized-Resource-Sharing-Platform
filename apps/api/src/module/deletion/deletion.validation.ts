import { z } from "zod";

export const resourceIdParamsSchema = z.object({ id: z.uuid("Select a valid resource") });
export const deletionRequestIdParamsSchema = z.object({ id: z.uuid("Select a valid deletion request") });

export const deleteResourceSchema = z.object({
  reason: z.string().trim().min(10, "Explain the deletion request in at least 10 characters").max(500).optional(),
});

export const listDeletionRequestsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "DENIED"]).default("PENDING"),
  page: z.preprocess((value) => (value === undefined || value === "" ? undefined : value), z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess((value) => (value === undefined || value === "" ? undefined : value), z.coerce.number().int().min(1).max(50).default(20)),
});

export type DeleteResourceInput = z.infer<typeof deleteResourceSchema>;
export type ListDeletionRequestsQuery = z.infer<typeof listDeletionRequestsQuerySchema>;