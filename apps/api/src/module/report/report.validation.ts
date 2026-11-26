import { z } from "zod";

export const reportIdParamsSchema = z.object({
  id: z.uuid("Select a valid report"),
});

export const fileReportSchema = z.object({
  resourceId: z.uuid("Select a valid resource"),
  reason: z.string().trim().min(10, "Explain the issue in at least 10 characters").max(1000, "Keep the report under 1000 characters"),
});

export const listReportsQuerySchema = z.object({
  status: z.enum(["PENDING", "RESOLVED", "DISMISSED"]).default("PENDING"),
  page: z.preprocess((value) => (value === undefined || value === "" ? undefined : value), z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess((value) => (value === undefined || value === "" ? undefined : value), z.coerce.number().int().min(1).max(50).default(20)),
});

export type FileReportInput = z.infer<typeof fileReportSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;