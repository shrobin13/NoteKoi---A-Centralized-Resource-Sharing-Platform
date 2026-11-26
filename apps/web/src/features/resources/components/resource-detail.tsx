"use client";

import { ArrowLeft, Download } from "lucide-react";
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
    </div>
  );
}