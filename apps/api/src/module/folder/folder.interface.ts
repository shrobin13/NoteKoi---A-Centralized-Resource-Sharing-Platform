import type { FolderState } from "../../../generated/prisma/enums.js";

export interface FolderView {
  id: string;
  name: string;
  parentId: string | null;
  courseId: string | null;
  depth: number;
  state: FolderState;
  createdAt: string;
  updatedAt: string;
  resourceCount: number;
  childCount: number;
  children: FolderView[];
}

export interface FolderListResult {
  items: FolderView[];
}