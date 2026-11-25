"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api";
import type { ProfileVerificationStatus } from "@/features/auth/types";
import { formatDate, formatDateTime, verificationLabel, verificationVariant } from "../format";
import { useApproveStudent, useRejectStudent, useStudentVerifications } from "../hooks";
import type { StudentVerificationItem } from "../types";
import { RejectForm } from "./reject-form";

const STATUS_OPTIONS: { value: ProfileVerificationStatus; label: string }[] = [
  { value: "PENDING_VERIFICATION", label: "Pending" },
  { value: "ACTIVE", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
];

/** S2-F3 — CR / Co-CR queue for the students of their own batch. */
export function StudentVerificationQueue() {
  const [status, setStatus] = useState<ProfileVerificationStatus>("PENDING_VERIFICATION");
  const queue = useStudentVerifications({ status });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Only students of your own batch appear here — the API narrows the queue for you.
        </p>
        <div className="w-full sm:w-48">
          <Select
            aria-label="Filter students by status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProfileVerificationStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {queue.isPending ? <LoadingState label="Loading the student queue…" /> : null}
      {queue.isError ? (
        <ErrorState
          title="Could not load the student queue"
          description={queue.error instanceof Error ? queue.error.message : undefined}
          onRetry={() => void queue.refetch()}
        />
      ) : null}
      {queue.data && queue.data.length === 0 ? (
        <EmptyState
          title={status === "PENDING_VERIFICATION" ? "No student is waiting" : "Nothing here"}
          description={
            status === "PENDING_VERIFICATION"
              ? "New registrations of your batch will show up in this list."
              : "Try another status filter."
          }
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {queue.data?.map((item) => (
          <li key={item.profileId}>
            <StudentRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StudentRow({ item }: { item: StudentVerificationItem }) {
  const approve = useApproveStudent();
  const reject = useRejectStudent();
  const [isRejecting, setIsRejecting] = useState(false);

  const handleApprove = async () => {
    try {
      await approve.mutateAsync(item.profileId);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleReject = async (reason: string) => {
    try {
      await reject.mutateAsync({ profileId: item.profileId, reason });
      setIsRejecting(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const isPending = item.verificationStatus === "PENDING_VERIFICATION";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {item.name} <span className="text-muted-foreground">· {item.regNo}</span>
            </p>
            <p className="text-sm text-muted-foreground">{item.email}</p>
            <p className="text-sm text-muted-foreground">
              {item.college.name} · {item.department.name} · {item.session.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Registered {formatDate(item.registeredAt)} ·{" "}
              {item.emailVerifiedAt ? `Email verified ${formatDateTime(item.emailVerifiedAt)}` : "Email not verified"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={verificationVariant(item.verificationStatus)}>
              {verificationLabel(item.verificationStatus)}
            </Badge>
            {!item.emailVerifiedAt ? <Badge variant="secondary">Email pending</Badge> : null}
          </div>
        </div>

        {item.rejectedReason ? (
          <p className="text-sm text-destructive">Rejected reason: {item.rejectedReason}</p>
        ) : null}

        {isPending ? (
          isRejecting ? (
            <RejectForm
              title={`Reject ${item.name}`}
              isPending={reject.isPending}
              onCancel={() => setIsRejecting(false)}
              onSubmit={handleReject}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleApprove} disabled={approve.isPending}>
                {approve.isPending ? "Approving…" : "Approve"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsRejecting(true)} disabled={reject.isPending}>
                Reject
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
