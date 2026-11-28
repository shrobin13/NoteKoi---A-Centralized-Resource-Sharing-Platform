"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/api";
import {
  useApproveDeletionRequest,
  useDenyDeletionRequest,
  useDismissReport,
  useEscalateDeletionRequest,
  useEscalateReport,
  useFetchPendingDeletionRequests,
  useFetchPendingReports,
  usePromoteResource,
  useResolveReport,
} from "../hooks";

export function CrGovernance() {
  const reports = useFetchPendingReports();
  const deletions = useFetchPendingDeletionRequests();
  const resolveReport = useResolveReport();
  const dismissReport = useDismissReport();
  const approveDeletion = useApproveDeletionRequest();
  const denyDeletion = useDenyDeletionRequest();
  const promote = usePromoteResource();
  const escalateReport = useEscalateReport();
  const escalateDeletion = useEscalateDeletionRequest();
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [escalatingId, setEscalatingId] = useState("");

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const escalate = async (kind: "report" | "deletion", id: string) => {
    const reason = (reasonById[id] ?? "").trim();
    if (reason.length < 10) {
      toast.error("Explain the escalation in at least 10 characters");
      return;
    }
    await run(() => kind === "report"
      ? escalateReport.mutateAsync({ reportId: id, reason })
      : escalateDeletion.mutateAsync({ deletionRequestId: id, reason }));
    setEscalatingId("");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Governance" description="Handle reports, deletion requests, promotions, and Sub Admin escalations." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Reports</CardTitle></CardHeader>
          <CardContent>
            {reports.isPending ? <LoadingState label="Loading reports…" /> : null}
            {reports.isError ? <ErrorState title="Could not load reports" onRetry={() => void reports.refetch()} /> : null}
            {reports.data?.length === 0 ? <EmptyState title="No pending reports" /> : null}
            <ul className="flex flex-col gap-3">
              {reports.data?.map((report) => (
                <li key={report.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{report.resource.title}</p>
                      <p className="text-xs text-muted-foreground">Reported by {report.reporter.name}</p>
                    </div>
                    <Badge variant="warning">PENDING</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{report.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void run(() => resolveReport.mutateAsync(report.id))}>Resolve</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void run(() => dismissReport.mutateAsync(report.id))}>Dismiss</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setEscalatingId((value) => value === `report-${report.id}` ? "" : `report-${report.id}`)}>Escalate</Button>
                    {report.resource.uploaderType === "STUDENT" ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => void run(() => promote.mutateAsync(report.resource.id))}>Promote to PLATFORM</Button>
                    ) : null}
                  </div>
                  {escalatingId === `report-${report.id}` ? (
                    <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={reasonById[report.id] ?? ""}
                        onChange={(event) => setReasonById((current) => ({ ...current, [report.id]: event.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Reason for Sub Admin escalation"
                      />
                      <div className="flex justify-end"><Button type="button" size="sm" onClick={() => void escalate("report", report.id)}>Send escalation</Button></div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Deletion requests</CardTitle></CardHeader>
          <CardContent>
            {deletions.isPending ? <LoadingState label="Loading deletion requests…" /> : null}
            {deletions.isError ? <ErrorState title="Could not load deletion requests" onRetry={() => void deletions.refetch()} /> : null}
            {deletions.data?.length === 0 ? <EmptyState title="No pending deletion requests" /> : null}
            <ul className="flex flex-col gap-3">
              {deletions.data?.map((request) => (
                <li key={request.id} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{request.resource.title}</p>
                      <p className="text-xs text-muted-foreground">Requested by {request.requester.name}</p>
                    </div>
                    <Badge variant="warning">PENDING</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{request.reason}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void run(() => approveDeletion.mutateAsync(request.id))}>Approve</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void run(() => denyDeletion.mutateAsync(request.id))}>Deny</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setEscalatingId((value) => value === `deletion-${request.id}` ? "" : `deletion-${request.id}`)}>Escalate</Button>
                  </div>
                  {escalatingId === `deletion-${request.id}` ? (
                    <div className="mt-3 flex flex-col gap-2 border-t pt-3">
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={reasonById[request.id] ?? ""}
                        onChange={(event) => setReasonById((current) => ({ ...current, [request.id]: event.target.value }))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Reason for Sub Admin escalation"
                      />
                      <div className="flex justify-end"><Button type="button" size="sm" onClick={() => void escalate("deletion", request.id)}>Send escalation</Button></div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
