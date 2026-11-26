import type { ResourceAudience, ResourceState, ResourceType, ResourceVersionState } from "@/features/resources/types";

export interface ModerationQueueItem {
  id: string;
  title: string;
  description: string | null;
  tags: string | null;
  resourceType: ResourceType;
  audience: ResourceAudience;
  state: ResourceState;
  versionNo: number | null;
  versionState: ResourceVersionState | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  uploader: { id: string; name: string; email: string };
  course: { id: string; name: string };
  session: { id: string; name: string } | null;
}

export interface ModerationQueueResult {
  items: ModerationQueueItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ModerationQueueState = "PENDING" | "IN_REVIEW";