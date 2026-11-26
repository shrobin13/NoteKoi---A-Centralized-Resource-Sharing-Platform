import { apiDelete, apiGet, apiPatch, apiPost, toQueryString } from "@/lib/api";
import type { CreateFolderInput, FolderTreeItem, UpdateFolderInput } from "./types";

export const fetchFolderTree = (courseId?: string, signal?: AbortSignal): Promise<FolderTreeItem[]> =>
  apiGet<FolderTreeItem[]>(`/folders${toQueryString({ courseId })}`, signal);

export const createFolder = async (input: CreateFolderInput): Promise<FolderTreeItem> =>
  (await apiPost<FolderTreeItem>("/folders", input)).data;

export const updateFolder = (id: string, input: UpdateFolderInput): Promise<FolderTreeItem> =>
  apiPatch<FolderTreeItem>(`/folders/${id}`, input);

export const deleteFolder = (id: string): Promise<{ id: string; deleted: true }> =>
  apiDelete<{ id: string; deleted: true }>(`/folders/${id}`);