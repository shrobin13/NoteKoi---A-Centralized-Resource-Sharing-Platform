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
import { useApproveTeacher, useRejectTeacher, useTeacherVerifications } from "../hooks";
import type { TeacherVerificationItem } from "../types";
import { RejectForm } from "./reject-form";
import { TeacherDepartmentsEditor } from "./teacher-departments-editor";

const STATUS_OPTIONS: { value: ProfileVerificationStatus; label: string }[] = [
  { value: "PENDING_VERIFICATION", label: "Pending" },
  { value: "ACTIVE", label: "Verified" },
  { value: "REJECTED", label: "Rejected" },
];

/** S2-F3 — Sub Admin queue for teachers of their own college. */
export function TeacherVerificationQueue() {
  const [status, setStatus] = useState<ProfileVerificationStatus>("PENDING_VERIFICATION");
  const queue = useTeacherVerifications({ status });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Teachers of your college appear here. Use <span className="font-medium">Departments</span> to attach them to
          the departments they teach.
        </p>
        <div className="w-full sm:w-48">
          <Select
            aria-label="Filter teachers by status"
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

      {queue.isPending ? <LoadingState label="Loading the teacher queue…" /> : null}
      {queue.isError ? (
        <ErrorState
          title="Could not load the teacher queue"
          description={queue.error instanceof Error ? queue.error.message : undefined}
          onRetry={() => void queue.refetch()}
        />
      ) : null}
      {queue.data && queue.data.length === 0 ? (
        <EmptyState
          title={status === "PENDING_VERIFICATION" ? "No teacher is waiting" : "Nothing here"}
          description={
            status === "PENDING_VERIFICATION"
              ? "Teacher registrations of your college will show up in this list."
              : "Try another status filter."
          }
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {queue.data?.map((item) => (
          <li key={item.profileId}>
            <TeacherRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeacherRow({ item }: { item: TeacherVerificationItem }) {
  const approve = useApproveTeacher();
  const reject = useRejectTeacher();
  const [isRejecting, setIsRejecting] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

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
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-muted-foreground">{item.email}</p>
            <p className="text-sm text-muted-foreground">
              {item.college.name} ·{" "}
              {item.departments.length > 0 ? item.departments.map((row) => row.name).join(", ") : "No department yet"}
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

        {isRejecting ? (
          <RejectForm
            title={`Reject ${item.name}`}
            isPending={reject.isPending}
            onCancel={() => setIsRejecting(false)}
            onSubmit={handleReject}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {isPending ? (
              <>
                <Button size="sm" onClick={handleApprove} disabled={approve.isPending}>
                  {approve.isPending ? "Approving…" : "Approve"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsRejecting(true)} disabled={reject.isPending}>
                  Reject
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setIsAssigning((value) => !value)}>
              {isAssigning ? "Close departments" : "Departments"}
            </Button>
          </div>
        )}

        {isAssigning ? (
          <TeacherDepartmentsEditor
            profileId={item.profileId}
            collegeId={item.college.id}
            current={item.departments}
            onDone={() => setIsAssigning(false)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

