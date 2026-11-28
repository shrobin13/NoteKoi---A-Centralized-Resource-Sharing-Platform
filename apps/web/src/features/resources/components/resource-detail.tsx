"use client";

import { ArrowLeft, Download, Flag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useResourceDetail } from "../hooks";
import { env } from "@/lib/env";
import type { ResourceState } from "../types";
import { useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/features/auth/hooks/use-auth";
import { useFileResourceReport, useRequestResourceDeletion } from "@/features/governance/hooks";
import { getErrorMessage } from "@/lib/api";

const stateVariant = (state: ResourceState) => {
  if (state === "APPROVED") return "success" as const;
  if (state === "REJECTED" || state === "DELETED") return "destructive" as const;
  if (state === "PENDING") return "warning" as const;
  return "secondary" as const;
};

const formatSize = (size: number | null): string => {
  if (size === null) return "Size unavailable";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export function ResourceDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const resource = useResourceDetail(params.id);
  const courseId = searchParams.get("courseId");
  const backHref = courseId ? `/courses/${encodeURIComponent(courseId)}` : "/courses";

  const me = useMe();
  const fileReport = useFileResourceReport();
  const requestDeletion = useRequestResourceDeletion();
  const [reportReason, setReportReason] = useState("");
  const [deletionReason, setDeletionReason] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showDeletion, setShowDeletion] = useState(false);

  if (resource.isPending) return <LoadingState label="Loading resource…" />;
  if (resource.isError) {
    return (
      <ErrorState
        title="Resource unavailable"
        description="This resource may not exist or may not be visible to your account."
        onRetry={() => void resource.refetch()}
      />
    );
  }

  const currentVersion = resource.data.versions.find((version) => version.id === resource.data.currentVersionId);
  const downloadHref = `${env.apiBaseUrl}/resources/${encodeURIComponent(resource.data.id)}/download`;

  const submitReport = async () => {
    if (reportReason.trim().length < 10) {
      toast.error("Explain the issue in at least 10 characters");
      return;
    }
    try {
      await fileReport.mutateAsync({ resourceId: resource.data.id, reason: reportReason.trim() });
      setReportReason("");
      setShowReport(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const submitDeletion = async () => {
    const isApproved = resource.data.state === "APPROVED";
    if (isApproved && deletionReason.trim().length < 10) {
      toast.error("Explain the deletion request in at least 10 characters");
      return;
    }
    try {
      await requestDeletion.mutateAsync({
        resourceId: resource.data.id,
        ...(isApproved ? { reason: deletionReason.trim() } : {}),
      });
      setDeletionReason("");
      setShowDeletion(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const isOwner = Boolean(me.data && me.data.id === resource.data.uploader.id);
  const canReport = Boolean(me.data && resource.data.state === "APPROVED" && resource.data.audience !== "PRIVATE");

  return (
    <div className="flex flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={backHref}><ArrowLeft aria-hidden /> Back to course resources</Link>
      </Button>

      <PageHeader
        title={resource.data.title}
        description={`${resource.data.course.name} · ${resource.data.department.name} · ${resource.data.uploader.name}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={stateVariant(resource.data.state)}>{resource.data.state.replaceAll("_", " ")}</Badge>
        <Badge variant="secondary">{resource.data.resourceType.replaceAll("_", " ")}</Badge>
        <Badge variant="outline">{resource.data.audience}</Badge>
        {resource.data.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resource details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {resource.data.description || "No description provided."}
          </p>
          {currentVersion ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="text-sm">
                <p className="font-medium">Version {currentVersion.versionNo}</p>
                <p className="text-xs text-muted-foreground">{formatSize(currentVersion.sizeBytes)}</p>
              </div>
              <Button asChild>
                <a href={downloadHref}>
                  <Download aria-hidden /> Download file
                </a>
              </Button>
            </div>
          ) : (
            <p className="border-t pt-4 text-sm text-muted-foreground">No downloadable version is available.</p>
          )}
        </CardContent>
      </Card>

      {(canReport || isOwner) ? (
        <Card>
          <CardHeader><CardTitle className="text-lg">Governance</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {canReport ? (
              <div className="flex flex-col gap-3">
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setShowReport((value) => !value)}>
                  <Flag aria-hidden /> Report resource
                </Button>
                {showReport ? (
                  <div className="flex flex-col gap-2 rounded-md border p-3">
                    <label htmlFor="report-reason" className="text-sm font-medium">Reason</label>
                    <textarea
                      id="report-reason"
                      rows={3}
                      maxLength={1000}
                      value={reportReason}
                      onChange={(event) => setReportReason(event.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowReport(false)}>Cancel</Button>
                      <Button type="button" size="sm" disabled={fileReport.isPending} onClick={() => void submitReport()}>
                        Submit report
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isOwner ? (
              <div className="flex flex-col gap-3 border-t pt-4">
                <Button type="button" variant="destructive" size="sm" className="w-fit" onClick={() => setShowDeletion((value) => !value)}>
                  <Trash2 aria-hidden /> Request deletion
                </Button>
                {showDeletion ? (
                  <div className="flex flex-col gap-2 rounded-md border p-3">
                    {resource.data.state === "APPROVED" ? (
                      <>
                        <label htmlFor="deletion-reason" className="text-sm font-medium">Reason</label>
                        <textarea
                          id="deletion-reason"
                          rows={3}
                          maxLength={500}
                          value={deletionReason}
                          onChange={(event) => setDeletionReason(event.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">PENDING uploads are canceled; IN_REVIEW uploads are flagged for moderator review.</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowDeletion(false)}>Cancel</Button>
                      <Button type="button" variant="destructive" size="sm" disabled={requestDeletion.isPending} onClick={() => void submitDeletion()}>
                        Confirm
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}