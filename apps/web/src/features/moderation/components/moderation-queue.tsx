"use client";

import { Check, ChevronLeft, ChevronRight, ExternalLink, Eye, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { env } from "@/lib/env";
import { getErrorMessage } from "@/lib/api";
import { useApproveResource, useModerationQueue, useOpenResourceForReview, useRejectResource } from "../hooks";
import type { ModerationQueueItem, ModerationQueueState } from "../types";

const PAGE_SIZE = 20;

const stateVariant = (state: string) => {
  if (state === "APPROVED") return "success" as const;
  if (state === "REJECTED") return "destructive" as const;
  if (state === "PENDING") return "warning" as const;
  return "secondary" as const;
};

export function ModerationQueue() {
  const [state, setState] = useState<ModerationQueueState | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const queue = useModerationQueue(state, page);
  const open = useOpenResourceForReview();
  const approve = useApproveResource();
  const reject = useRejectResource();
  const isMutating = open.isPending || approve.isPending || reject.isPending;

  const runAction = async (action: () => Promise<unknown>): Promise<boolean> => {
    try {
      await action();
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return false;
    }
  };

  const rejectItem = (id: string, reason: string): Promise<boolean> =>
    runAction(() => reject.mutateAsync({ id, reason }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Moderation queue" description="Review student uploads in your assigned batches or college." />
      <div className="flex justify-end">
        <div className="w-full sm:w-52">
          <Select
            aria-label="Filter moderation queue"
            value={state}
            onChange={(event) => {
              setState(event.target.value as ModerationQueueState | "ALL");
              setPage(1);
            }}
          >
            <option value="ALL">All open items</option>
            <option value="PENDING">Pending</option>
            <option value="IN_REVIEW">In review</option>
          </Select>
        </div>
      </div>

      {queue.isPending ? <LoadingState label="Loading moderation queue…" /> : null}
      {queue.isError ? (
        <ErrorState
          title="Could not load moderation queue"
          description={queue.error instanceof Error ? queue.error.message : undefined}
          onRetry={() => void queue.refetch()}
        />
      ) : null}
      {queue.isError && queue.error instanceof Error && "status" in queue.error && queue.error.status === 403 ? (
        <Alert variant="warning">
          <AlertTitle>No moderation scope</AlertTitle>
          <AlertDescription>Your account has no active moderation role for a batch or college.</AlertDescription>
        </Alert>
      ) : null}
      {queue.data && queue.data.items.length === 0 ? <EmptyState title="No resources need review" /> : null}

      <ul className="flex flex-col gap-3">
        {queue.data?.items.map((item) => (
          <li key={item.id}>
            <ModerationRow
              item={item}
              busy={isMutating}
              onOpen={() => void runAction(() => open.mutateAsync(item.id))}
              onApprove={() => void runAction(() => approve.mutateAsync(item.id))}
              onReject={(reason) => rejectItem(item.id, reason)}
            />
          </li>
        ))}
      </ul>

      {queue.data && queue.data.totalPages > 1 ? (
        <nav aria-label="Moderation queue pages" className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1 || queue.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-28 text-center text-sm text-muted-foreground">Page {queue.data.page} of {queue.data.totalPages}</span>
          <Button type="button" variant="outline" size="icon" aria-label="Next page" disabled={page >= queue.data.totalPages || queue.isFetching} onClick={() => setPage((value) => Math.min(queue.data?.totalPages ?? value, value + 1))}>
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

function ModerationRow({
  item,
  busy,
  onOpen,
  onApprove,
  onReject,
}: {
  item: ModerationQueueItem;
  busy: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onReject: (reason: string) => Promise<boolean>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const isPending = item.versionState === "PENDING";

  const submitReject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      toast.error("Give the uploader a reason between 10 and 500 characters");
      return;
    }

    const completed = await onReject(reason.trim());
    if (!completed) return;
    setRejecting(false);
    setReason("");
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.course.name}{item.session ? ` · ${item.session.name}` : ""} · {item.uploader.name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={stateVariant(item.state)}>{item.state.replaceAll("_", " ")}</Badge>
            {item.versionState ? <Badge variant={stateVariant(item.versionState)}>v{item.versionNo} {item.versionState.replaceAll("_", " ")}</Badge> : null}
            <Badge variant="outline">{item.audience}</Badge>
          </div>
        </div>

        {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <Link href={`/resources/${item.id}`} className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
            Open details <ExternalLink className="size-3.5" aria-hidden />
          </Link>
          <div className="flex flex-wrap gap-2">
            {isPending ? (
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onOpen}>
                <Eye aria-hidden /> Start review
              </Button>
            ) : null}
            {!isPending ? (
              <>
                <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
                  <Check aria-hidden /> Approve
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRejecting((value) => !value)}>
                  <X aria-hidden /> Reject
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {isPending ? null : (
          <a
            href={`${env.apiBaseUrl}/resources/${encodeURIComponent(item.id)}/download`}
            className="w-fit text-xs text-muted-foreground underline underline-offset-2"
          >
            Download current version
          </a>
        )}

        {rejecting ? (
          <form className="flex flex-col gap-3 border-t pt-3" onSubmit={submitReject}>
            <label htmlFor={`reject-reason-${item.id}`} className="text-sm font-medium">Reason for rejection</label>
            <textarea
              id={`reject-reason-${item.id}`}
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" size="sm" disabled={busy}>Confirm reject</Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}