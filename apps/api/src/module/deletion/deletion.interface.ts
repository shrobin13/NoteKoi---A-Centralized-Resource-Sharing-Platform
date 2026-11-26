import type { DeletionRequestStatus, ResourceState } from "../../../generated/prisma/enums.js";

export interface DeletionRequestView {
  id: string;
  resourceId: string;
  reason: string;
  status: DeletionRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  requester: { id: string; name: string; email: string };
  decidedBy: { id: string; name: string } | null;
  resource: {
    id: string;
    title: string;
    state: ResourceState;
    audience: string;
    uploader: { id: string; name: string };
    course: { id: string; name: string };
    session: { id: string; name: string } | null;
  };
}

export interface DeletionRequestListResult {
  items: DeletionRequestView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DeletionActionResult {
  resourceId: string;
  action: "CANCELED" | "FLAGGED" | "REQUESTED" | "DELETED";
  state: ResourceState;
  requestId?: string;
}