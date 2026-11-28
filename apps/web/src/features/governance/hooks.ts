"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  approveDeletionRequest,
  denyDeletionRequest,
  dismissReport,
  escalateDeletionRequest,
  escalateReport,
  fetchPendingDeletionRequests,
  fetchPendingReports,
  fileResourceReport,
  promoteResource,
  requestResourceDeletion,
  resolveReport,
  decideEscalation,
  fetchEscalations,
  fetchAuditLogs,
  overrideResourceUpdate,
  overrideResourceDelete,
  revokePlatformResource,
} from "./api";
import type { GovernanceActionResult } from "./types";

export const governanceKeys = {
  all: ["governance"] as const,
};

export const useFileResourceReport = () => {
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, { resourceId: string; reason: string }>({
    mutationFn: ({ resourceId, reason }) => fileResourceReport(resourceId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: governanceKeys.all });
      toast.success("Report submitted");
    },
  });
};

export const useRequestResourceDeletion = () => {
  const queryClient = useQueryClient();
  return useMutation<GovernanceActionResult, unknown, { resourceId: string; reason?: string }>({
    mutationFn: ({ resourceId, reason }) => requestResourceDeletion(resourceId, reason),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      toast.success(
        result.action === "REQUESTED"
          ? "Deletion request submitted"
          : result.action === "FLAGGED"
            ? "Deletion flagged for review"
            : result.action === "CANCELED"
              ? "Pending upload canceled"
              : "Resource deleted",
      );
    },
  });
};

export const useFetchPendingReports = () => {
  return useQuery({
    queryKey: ["pendingReports"],
    queryFn: ({ signal }) => fetchPendingReports(signal),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useFetchPendingDeletionRequests = () => {
  return useQuery({
    queryKey: ["pendingDeletionRequests"],
    queryFn: ({ signal }) => fetchPendingDeletionRequests(signal),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

const useGovernanceMutation = <TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>, message: string) => {
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, TVariables>({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: governanceKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      toast.success(message);
    },
  });
};

export const useResolveReport = () => useGovernanceMutation((id: string) => resolveReport(id), "Report resolved");
export const useDismissReport = () => useGovernanceMutation((id: string) => dismissReport(id), "Report dismissed");
export const useApproveDeletionRequest = () => useGovernanceMutation((id: string) => approveDeletionRequest(id), "Deletion approved");
export const useDenyDeletionRequest = () => useGovernanceMutation((id: string) => denyDeletionRequest(id), "Deletion denied");
export const usePromoteResource = () => useGovernanceMutation((id: string) => promoteResource(id), "Resource promoted to PLATFORM");
export const useEscalateReport = () =>
  useGovernanceMutation(({ reportId, reason }: { reportId: string; reason: string }) => escalateReport(reportId, reason), "Report escalated");
export const useEscalateDeletionRequest = () =>
  useGovernanceMutation(
    ({ deletionRequestId, reason }: { deletionRequestId: string; reason: string }) => escalateDeletionRequest(deletionRequestId, reason),
    "Deletion request escalated",
  );
export const useDecideEscalation = () =>
  useGovernanceMutation(
    ({ id, decision }: { id: string; decision: "RESOLVED" | "DISMISSED" | "APPROVED" | "DENIED" }) => decideEscalation(id, decision),
    "Escalation resolved",
  );
export const useRevokePlatformResource = () =>
  useGovernanceMutation((id: string) => revokePlatformResource(id), "PLATFORM publication revoked");
export const useOverrideResourceUpdate = () =>
  useGovernanceMutation(
    ({ id, justification, patch }: { id: string; justification: string; patch: Record<string, unknown> }) =>
      overrideResourceUpdate(id, justification, patch),
    "Resource overridden",
  );
export const useOverrideResourceDelete = () =>
  useGovernanceMutation(
    ({ id, justification }: { id: string; justification: string }) => overrideResourceDelete(id, justification),
    "Resource soft-deleted",
  );
export const useFetchEscalations = () => {
  return useQuery({
    queryKey: ["escalations"],
    queryFn: ({ signal }) => fetchEscalations(signal),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useAuditLogs = (enabled = true) =>
  useQuery({
    queryKey: [...governanceKeys.all, "audit-logs"],
    queryFn: ({ signal }) => fetchAuditLogs(signal),
    enabled,
  });
