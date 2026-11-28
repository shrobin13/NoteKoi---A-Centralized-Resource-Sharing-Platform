import { z } from "zod";

/** Q1 (playbook §11) — the only resource types the UI offers. */
export const RESOURCE_TYPES = ["NOTES", "SLIDES", "ASSIGNMENT", "QUESTION_BANK", "BOOK", "OTHER"] as const;

export const AUDIENCES = ["PRIVATE", "COLLEGE", "PERMITTED", "PLATFORM"] as const;

export const resourceIdParamsSchema = z.object({
  id: z.uuid("Select a valid resource"),
});

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** Multipart repeats the field (`sessionIds=a&sessionIds=b`), JSON clients send an array. */
const uuidList = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return value;
}, z.array(z.uuid("Select valid sessions")).max(50, "Select at most 50 sessions").optional());

/** `tags` arrives as a repeated field, a comma list, or an array. Stored comma-joined. */
const tagsInput = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : value;

  if (!Array.isArray(raw)) return value;

  const cleaned = raw
    .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
    .filter((entry) => entry !== "");

  return cleaned.length > 0 ? cleaned : undefined;
}, z.array(z.string().trim().min(1, "Tags must not be empty").max(32, "A tag is too long")).max(10, "Add at most 10 tags").optional());

/**
 * S3-B3 — `POST /resources` body (multipart; the file itself is on `file`).
 * `collegeId` is only read for a Platform Admin, who has no profile to derive it
 * from. A student's session is taken from their profile, never from the form.
 */
export const uploadResourceSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(200, "Title is too long"),
    description: z.preprocess(emptyToUndefined, z.string().trim().max(2000, "Description is too long").optional()),
    tags: tagsInput,
    resourceType: z.enum(RESOURCE_TYPES, "Select a resource type"),
    audience: z.enum(AUDIENCES, "Select an audience").optional(),
    courseId: z.uuid("Select a valid course"),
    semesterCourseId: z.preprocess(emptyToUndefined, z.uuid("Select a valid semester course").optional()),
    categoryId: z.preprocess(emptyToUndefined, z.uuid("Select a valid category").optional()),
    collegeId: z.preprocess(emptyToUndefined, z.uuid("Select a valid college").optional()),
    sessionIds: uuidList,
  })
  .superRefine((value, ctx) => {
    if (value.categoryId && !value.semesterCourseId) {
      ctx.addIssue({ code: "custom", path: ["semesterCourseId"], message: "Choose a semester course for this category" });
    }
    if (value.audience === "PERMITTED" && (!value.sessionIds || value.sessionIds.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionIds"],
        message: "Pick at least one batch to share a PERMITTED resource with",
      });
    }
  });

export type UploadResourceInput = z.infer<typeof uploadResourceSchema>;

/** S3-B7 — metadata-only edits. Unknown fields (including audience/state) are rejected. */
export const editResourceMetadataSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(200).optional(),
    description: z.union([z.string().trim().max(2000), z.null()]).optional(),
    tags: z.preprocess((value) => {
      if (value === null || value === "") return [];
      return tagsInput.parse(value);
    }, z.array(z.string().trim().min(1).max(32)).max(10).optional()),
    resourceType: z.enum(RESOURCE_TYPES).optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: "Change at least one metadata field",
  });

export type EditResourceMetadataInput = z.infer<typeof editResourceMetadataSchema>;

/** S4-B3 — teacher publication target and optional granted batches. */
export const publishResourceSchema = z
  .object({
    audience: z.enum(["PERMITTED", "PLATFORM"]),
    sessionIds: uuidList,
  })
  .superRefine((value, ctx) => {
    if (value.audience === "PERMITTED" && (!value.sessionIds || value.sessionIds.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionIds"],
        message: "Pick at least one batch to share a PERMITTED resource with",
      });
    }
    if (value.audience === "PLATFORM" && value.sessionIds?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionIds"],
        message: "Platform resources cannot have batch grants",
      });
    }
  });

export type PublishResourceInput = z.infer<typeof publishResourceSchema>;

export const addResourceGrantsSchema = z
  .object({ sessionIds: uuidList })
  .superRefine((value, ctx) => {
    if (!value.sessionIds || value.sessionIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["sessionIds"], message: "Select at least one batch" });
    }
  });

export const resourceGrantParamsSchema = z.object({
  id: z.uuid("Select a valid resource"),
  sessionId: z.uuid("Select a valid batch"),
});

export type AddResourceGrantsInput = z.infer<typeof addResourceGrantsSchema>;

/** S3-B4 — `GET /resources` query. Search is course + keyword + type (A.1/A.4). */
export const listResourcesQuerySchema = z.object({
  courseId: z.preprocess(emptyToUndefined, z.uuid("Select a valid course").optional()),
  semesterCourseId: z.preprocess(emptyToUndefined, z.uuid("Select a valid semester course").optional()),
  categoryId: z.preprocess(emptyToUndefined, z.uuid("Select a valid category").optional()),
  departmentId: z.preprocess(emptyToUndefined, z.uuid("Select a valid department").optional()),
  collegeId: z.preprocess(emptyToUndefined, z.uuid("Select a valid college").optional()),
  resourceType: z.preprocess(emptyToUndefined, z.enum(RESOURCE_TYPES, "Select a resource type").optional()),
  keyword: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1, "Type something to search").max(100, "The search text is too long").optional(),
  ),
  sort: z.preprocess(emptyToUndefined, z.enum(["newest", "oldest", "title"]).default("newest")),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(12)),
});

export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;

/** The uploader's own rows ("My uploads"), any state. */
export const listOwnResourcesQuerySchema = listResourcesQuerySchema.extend({
  state: z.preprocess(
    emptyToUndefined,
    z.enum(["PENDING", "IN_REVIEW", "APPROVED", "REJECTED", "DELETED"]).optional(),
  ),
});

export type ListOwnResourcesQuery = z.infer<typeof listOwnResourcesQuerySchema>;
