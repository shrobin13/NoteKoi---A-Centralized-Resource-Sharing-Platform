export interface GovernanceActionResult {
  resourceId: string;
  action: "CANCELED" | "FLAGGED" | "REQUESTED" | "DELETED";
  state: string;
  requestId?: string;
}

export interface ReportQueueItem {
  id: string;
  resourceId: string;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  reporter: { id: string; name: string; email: string };
  resource: {
    id: string;
    title: string;
    audience: string;
    uploaderType: string;
    uploader: { id: string; name: string };
    course: { id: string; name: string };
    session: { id: string; name: string } | null;
  };
}

export interface DeletionQueueItem {
  id: string;
  resourceId: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  createdAt: string;
  requester: { id: string; name: string; email: string };
  resource: {
    id: string;
    title: string;
    state: string;
    audience: string;
    uploader: { id: string; name: string };
    course: { id: string; name: string };
    session: { id: string; name: string } | null;
  };
}

export interface EscalationQueueItem {
  id: string;
  resourceId: string;
  reportId: string | null;
  deletionRequestId: string | null;
  reason: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
  resource: {
    id: string;
    title: string;
    audience: string;
    uploader: { id: string; name: string };
    course: { id: string; name: string };
    session: { id: string; name: string } | null;
  };
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actor: { id: string; name: string; email: string };
  action: string;
  targetType: string;
  targetId: string;
  justification: string | null;
  createdAt: string;
}
