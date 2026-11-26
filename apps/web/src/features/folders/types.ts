export interface FolderTreeItem {
  id: string;
  name: string;
  parentId: string | null;
  courseId: string | null;
  depth: number;
  state: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  resourceCount: number;
  childCount: number;
  children: FolderTreeItem[];
}

export interface CreateFolderInput {
  name: string;
  parentId?: string | null;
  courseId?: string | null;
}

export interface UpdateFolderInput {
  name?: string;
  parentId?: string | null;
}