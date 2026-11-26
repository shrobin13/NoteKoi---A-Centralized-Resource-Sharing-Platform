"use client";

import { Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDepartmentSessions } from "@/features/academic/hooks";
import { getErrorMessage } from "@/lib/api";
import { useMyResources, useResourceDetail, useSaveResourceSharing } from "../hooks";
import type { PublishAudience } from "../schemas";

export function ResourceSharingManager() {
  const resources = useMyResources("APPROVED");
  const [selectedId, setSelectedId] = useState("");
  const ownTeacherResources = resources.data?.filter((resource) => resource.uploaderType === "TEACHER") ?? [];
  const selected = useResourceDetail(selectedId);
  const sessions = useDepartmentSessions(selected.data?.departmentId ?? "");
  const saveSharing = useSaveResourceSharing();
  const [targetAudience, setTargetAudience] = useState<PublishAudience>("PRIVATE");
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  useEffect(() => {
    if (!selected.data) return;
    setTargetAudience(
      selected.data.audience === "PLATFORM" || selected.data.audience === "PERMITTED"
        ? selected.data.audience
        : "PRIVATE",
    );
    setSelectedSessionIds(selected.data.grants.map((grant) => grant.sessionId));
  }, [selected.data?.id, selected.data?.updatedAt, selected.data?.grants]);

  useEffect(() => {
    if (!selectedId && ownTeacherResources.length > 0) setSelectedId(ownTeacherResources[0]?.id ?? "");
    else if (selectedId && !ownTeacherResources.some((resource) => resource.id === selectedId)) {
      setSelectedId(ownTeacherResources[0]?.id ?? "");
    }
  }, [ownTeacherResources, selectedId]);

  const currentSessionIds = selected.data?.grants.map((grant) => grant.sessionId) ?? [];
  const hasSessionChanges =
    currentSessionIds.length !== selectedSessionIds.length ||
    currentSessionIds.some((sessionId) => !selectedSessionIds.includes(sessionId));
  const hasChanges =
    selected.data !== undefined &&
    (selected.data.audience !== targetAudience ||
      (targetAudience === "PERMITTED" && hasSessionChanges) ||
      (targetAudience === "PERMITTED" && selected.data.audience === "PRIVATE"));

  const save = async () => {
    if (!selected.data || selected.data.audience === "PLATFORM") return;
    try {
      await saveSharing.mutateAsync({
        resourceId: selected.data.id,
        currentAudience: selected.data.audience,
        targetAudience,
        existingSessionIds: currentSessionIds,
        selectedSessionIds,
      });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Teacher resources</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-5">
        {resources.isPending ? <LoadingState label="Loading your resources…" /> : null}
        {resources.isError ? (
          <ErrorState
            title="Could not load your resources"
            description={resources.error instanceof Error ? resources.error.message : undefined}
            onRetry={() => void resources.refetch()}
          />
        ) : null}
        {resources.data && ownTeacherResources.length === 0 ? (
          <EmptyState title="No approved teacher resources" description="Upload a PRIVATE resource to begin publishing." />
        ) : null}

        {ownTeacherResources.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.4fr)]">
            <ul className="flex flex-col gap-2">
              {ownTeacherResources.map((resource) => (
                <li key={resource.id}>
                  <button
                    type="button"
                    aria-pressed={selectedId === resource.id}
                    onClick={() => setSelectedId(resource.id)}
                    className={`w-full rounded-md border p-3 text-left hover:bg-accent ${selectedId === resource.id ? "border-foreground bg-accent" : "bg-card"}`}
                  >
                    <span className="block truncate text-sm font-medium">{resource.title}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{resource.course.name}</span>
                      <Badge variant="outline">{resource.audience}</Badge>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="min-w-0">
              {selected.isPending ? <LoadingState label="Loading sharing settings…" /> : null}
              {selected.isError ? (
                <ErrorState
                  title="Could not load sharing settings"
                  description={selected.error instanceof Error ? selected.error.message : undefined}
                  onRetry={() => void selected.refetch()}
                />
              ) : null}
              {selected.data ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{selected.data.title}</p>
                      <p className="text-xs text-muted-foreground">{selected.data.course.name} · {selected.data.department.name}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/resources/${selected.data.id}`}>Open details</Link>
                    </Button>
                  </div>

                  {selected.data.audience === "PLATFORM" ? (
                    <p className="text-sm text-muted-foreground">This resource is published to PLATFORM. This workspace does not withdraw platform publication.</p>
                  ) : (
                    <fieldset className="flex flex-col gap-4">
                      <legend className="mb-2 text-sm font-medium">Share with</legend>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {(["PRIVATE", "PERMITTED", "PLATFORM"] as const).map((audience) => (
                          <label key={audience} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <input
                              type="radio"
                              name={`audience-${selected.data.id}`}
                              value={audience}
                              checked={targetAudience === audience}
                              onChange={() => setTargetAudience(audience)}
                              className="accent-foreground"
                            />
                            {audience === "PRIVATE" ? "Keep private" : audience === "PERMITTED" ? "Selected sessions" : "PLATFORM"}
                          </label>
                        ))}
                      </div>

                      {targetAudience === "PERMITTED" ? (
                        <div className="flex flex-col gap-2 rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Sessions in {selected.data.department.name}</p>
                          {sessions.isPending ? <LoadingState label="Loading sessions…" /> : null}
                          {sessions.isError ? <p className="text-sm text-destructive">Could not load sessions for this department.</p> : null}
                          {sessions.data?.sessions.length === 0 ? <p className="text-sm text-muted-foreground">No active sessions are available.</p> : null}
                          {sessions.data?.sessions.map((session) => (
                            <label key={session.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedSessionIds.includes(session.id)}
                                onChange={(event) => {
                                  setSelectedSessionIds((current) =>
                                    event.target.checked
                                      ? [...new Set([...current, session.id])]
                                      : current.filter((id) => id !== session.id),
                                  );
                                }}
                                className="size-4 accent-foreground"
                              />
                              {session.name}
                              {currentSessionIds.includes(session.id) ? <Badge variant="outline">Shared</Badge> : null}
                            </label>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex justify-end">
                        <Button type="button" disabled={!hasChanges || saveSharing.isPending} onClick={() => void save()}>
                          <Share2 aria-hidden /> {saveSharing.isPending ? "Saving…" : "Save sharing"}
                        </Button>
                      </div>
                    </fieldset>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}