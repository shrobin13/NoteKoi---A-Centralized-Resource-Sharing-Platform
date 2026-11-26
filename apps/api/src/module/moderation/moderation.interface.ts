import type { EscalationStatus, ResourceState, VersionState } from "../../../generated/prisma/enums.js";

/** One row of a moderator's inbox (joined so the UI needs no second call). */
export interface ModerationQueueItem {
  id: string;
  title: string;
  description: string | null;
  tags: string | null;
  resourceType: string;
  audience: string;
  state: ResourceState;
  versionNo: number | null;
  versionState: VersionState | null;
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

/** What a decision returns: the new states, so the UI can update in place. */
export interface ModerationDecision {
  id: string;
  state: ResourceState;
  versionNo: number | null;
  versionState: VersionState | null;
  previousState: ResourceState;
  reason: string | null;
  decidedAt: string;
}

export interface EscalationView {
  id: string;
  resourceId: string;
  reportId: string | null;
  deletionRequestId: string | null;
  reason: string;
  status: EscalationStatus;
  createdAt: string;
  resolvedAt: string | null;
  escalatedBy: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
  resource: {
    id: string;
    title: string;
    audience: string;
    uploader: { id: string; name: string };
    course: { id: string; name: string };
    session: { id: string; name: string } | null;
  };
  report: { id: string; reason: string; status: string } | null;
  deletionRequest: { id: string; reason: string; status: string } | null;
}

export interface EscalationListResult {
  items: EscalationView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
