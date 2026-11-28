import { apiDelete, apiGet, apiPatch, apiPost, toQueryString } from "@/lib/api";
import type { DeletionQueueItem, GovernanceActionResult, ReportQueueItem, EscalationQueueItem, AuditLogItem } from "./types";

export const fileResourceReport = async (resourceId: string, reason: string): Promise<unknown> =>
  (await apiPost<unknown>("/reports", { resourceId, reason })).data;

export const requestResourceDeletion = async (resourceId: string, reason?: string): Promise<GovernanceActionResult> =>
  (await apiPost<GovernanceActionResult>(`/deletions/resources/${resourceId}`, reason ? { reason } : {})).data;

export const fetchPendingReports = (signal?: AbortSignal): Promise<ReportQueueItem[]> =>
  apiGet<ReportQueueItem[]>(`/reports${toQueryString({ status: "PENDING", pageSize: 50 })}`, signal);

export const resolveReport = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/reports/${id}/resolve`, {}).then((response) => response.data);

export const dismissReport = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/reports/${id}/dismiss`, {}).then((response) => response.data);

export const fetchPendingDeletionRequests = (signal?: AbortSignal): Promise<DeletionQueueItem[]> =>
  apiGet<DeletionQueueItem[]>(`/deletions/requests${toQueryString({ status: "PENDING", pageSize: 50 })}`, signal);

export const approveDeletionRequest = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/deletions/requests/${id}/approve`, {}).then((response) => response.data);

export const denyDeletionRequest = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/deletions/requests/${id}/deny`, {}).then((response) => response.data);

export const promoteResource = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/resources/${id}/promote`, {}).then((response) => response.data);

export const escalateReport = (reportId: string, reason: string): Promise<unknown> =>
  apiPost<unknown>("/moderation/escalations", { reportId, reason }).then((response) => response.data);

export const escalateDeletionRequest = (deletionRequestId: string, reason: string): Promise<unknown> =>
  apiPost<unknown>("/moderation/escalations", { deletionRequestId, reason }).then((response) => response.data);

export const fetchEscalations = (signal?: AbortSignal): Promise<EscalationQueueItem[]> =>
  apiGet<EscalationQueueItem[]>(`/moderation/escalations${toQueryString({ status: "OPEN", pageSize: 50 })}`, signal);

export const decideEscalation = (id: string, decision: "RESOLVED" | "DISMISSED" | "APPROVED" | "DENIED"): Promise<unknown> =>
  apiPost<unknown>(`/moderation/escalations/${id}/decide`, { decision }).then((response) => response.data);

export const revokePlatformResource = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/resources/${id}/revoke-platform`, {}).then((response) => response.data);

export const overrideResourceUpdate = (id: string, justification: string, patch: Record<string, unknown>): Promise<unknown> =>
  apiPatch<unknown>(`/admin/resources/${id}`, { justification, ...patch });

export const fetchAuditLogs = (signal?: AbortSignal): Promise<AuditLogItem[]> =>
  apiGet<AuditLogItem[]>(`/admin/audit-logs${toQueryString({ pageSize: 50 })}`, signal);

export const softDeleteOverride = (id: string, justification: string): Promise<unknown> =>
  apiDelete<unknown>(`/admin/resources/${id}`, { data: { justification } });

export const overrideResourceDelete = (id: string, justification: string): Promise<unknown> =>
  apiDelete<unknown>(`/admin/resources/${id}`, { justification });
