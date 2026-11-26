import { z } from "zod";

export const RESOURCE_TYPES = ["NOTES", "SLIDES", "ASSIGNMENT", "QUESTION_BANK", "BOOK", "OTHER"] as const;
export const RESOURCE_AUDIENCES = ["PRIVATE", "COLLEGE", "PERMITTED", "PLATFORM"] as const;

export const resourceUploadSchema = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters").max(200, "Keep the title under 200 characters"),
  description: z.string().trim().max(2000, "Keep the description under 2000 characters"),
  tags: z.string().trim().max(320, "Keep tags under 320 characters"),
  resourceType: z.enum(RESOURCE_TYPES),
  courseId: z.uuid("Choose a course"),
  audience: z.enum(RESOURCE_AUDIENCES),
});

export type ResourceUploadInput = z.infer<typeof resourceUploadSchema>;

export const resourceMetadataSchema = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters").max(200),
  description: z.string().trim().max(2000),
  tags: z.string().trim().max(320),
  resourceType: z.enum(RESOURCE_TYPES),
});

export type ResourceMetadataInput = z.infer<typeof resourceMetadataSchema>;

export const publishAudienceSchema = z.enum(["PRIVATE", "PERMITTED", "PLATFORM"]);
export type PublishAudience = z.infer<typeof publishAudienceSchema>;