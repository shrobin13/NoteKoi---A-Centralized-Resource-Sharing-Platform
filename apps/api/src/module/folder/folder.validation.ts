import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const folderIdParamsSchema = z.object({
  id: z.uuid("Select a valid folder"),
});

export const listFoldersQuerySchema = z.object({
  courseId: z.preprocess(emptyToUndefined, z.uuid("Select a valid course").optional()),
});

const folderName = z.string().trim().min(1, "Folder name is required").max(120, "Folder name is too long");

export const createFolderSchema = z.object({
  name: folderName,
  parentId: z.uuid("Select a valid parent folder").nullable().optional(),
  courseId: z.uuid("Select a valid course").nullable().optional(),
});

export const updateFolderSchema = z
  .object({
    name: folderName.optional(),
    parentId: z.uuid("Select a valid parent folder").nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide a folder name or parent folder",
  });

export type ListFoldersQuery = z.infer<typeof listFoldersQuerySchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;