"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api";
import { useCollegeList } from "@/features/academic/hooks";
import { useAppointSubAdmin, useRoles, useTeachers } from "../hooks";
import { INPUT_CLASS, RoleRow } from "./role-management";

/**
 * S2-F4 — `POST /users/roles/sub-admin` (Platform Admin only).
 * D9: exactly one active Sub Admin per college; the emergency toggle swaps the
 * holder in the same transaction (audited `SUB_ADMIN_REPLACED`), so it asks for
 * a justification up front and warns before the click.
 */
export function SubAdminAppointment() {
  const appoint = useAppointSubAdmin();
  const colleges = useCollegeList();
  const [collegeId, setCollegeId] = useState("");
  const [teacherUserId, setTeacherUserId] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const teachers = useTeachers({ collegeId: collegeId || undefined, limit: 100 }, collegeId.length > 0);

  const reset = () => {
    setTeacherUserId("");
    setEmergency(false);
    setExpiresAt("");
    setReason("");
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!collegeId) {
      setError("Pick the college this Sub Admin will manage");
      return;
    }

    if (!teacherUserId) {
      setError("Pick the verified teacher who becomes Sub Admin");
      return;
    }

    if (emergency && reason.trim().length < 5) {
      setError("An emergency replacement needs a justification (at least 5 characters)");
      return;
    }

    setError(null);

    try {
      await appoint.mutateAsync({
        userId: teacherUserId,
        collegeId,
        emergency,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
        reason: reason.trim() || undefined,
      });
      reset();
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      setError(message);
      toast.error(message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appoint a Sub Admin</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              College
              <Select
                value={collegeId}
                onChange={(event) => {
                  setCollegeId(event.target.value);
                  setTeacherUserId("");
                  setError(null);
                }}
              >
                <option value="">Select a college</option>
                {colleges.data?.map((college) => (
                  <option key={college.id} value={college.id} disabled={!college.isActive}>
                    {college.name}
                    {college.isActive ? "" : " (deactivated)"}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Verified teacher
              <Select
                value={teacherUserId}
                onChange={(event) => setTeacherUserId(event.target.value)}
                disabled={!collegeId || teachers.isPending || !teachers.data || teachers.data.length === 0}
              >
                <option value="">
                  {!collegeId
                    ? "Pick a college first"
                    : teachers.data && teachers.data.length === 0
                      ? "No verified teacher in this college"
                      : "Select a teacher"}
                </option>
                {teachers.data?.map((teacher) => (
                  <option key={teacher.userId} value={teacher.userId}>
                    {teacher.name} · {teacher.email}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium sm:max-w-xs">
            Expires (optional)
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className={INPUT_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Justification {emergency ? "(required for emergency)" : "(optional)"}
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this appointment made?"
              className={INPUT_CLASS}
              maxLength={500}
            />
          </label>

          <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-input"
              checked={emergency}
              onChange={(event) => setEmergency(event.target.checked)}
            />
            <span>
              <span className="font-medium">Emergency replacement</span>
              <span className="block text-muted-foreground">
                The current Sub Admin of this college loses the role immediately. The removal is recorded as{" "}
                <span className="font-mono">SUB_ADMIN_REPLACED</span> in the audit log — only use it when the holder is
                unavailable.
              </span>
            </span>
          </label>

          {teachers.isError ? (
            <p className="text-sm text-destructive">
              {teachers.error instanceof Error ? teachers.error.message : "Could not load the teachers."}
            </p>
          ) : null}

          {error ? <FieldError>{error}</FieldError> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={appoint.isPending}>
              {appoint.isPending ? "Appointing…" : emergency ? "Replace Sub Admin" : "Appoint Sub Admin"}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={appoint.isPending}>
              Clear
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            A college holds one Sub Admin. Appointing a second one without the emergency toggle is refused with{" "}
            <span className="font-mono">SUB_ADMIN_EXISTS</span>.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

/** Current Sub Admins, one row per college (same row component as `/admin/roles`). */
export function SubAdminList() {
  const roles = useRoles({ role: "SUB_ADMIN" });

  if (roles.isPending) return <LoadingState label="Loading Sub Admins…" />;
  if (roles.isError) {
    return (
      <ErrorState
        title="Could not load Sub Admins"
        description={roles.error instanceof Error ? roles.error.message : undefined}
        onRetry={() => void roles.refetch()}
      />
    );
  }
  if (!roles.data || roles.data.length === 0) {
    return (
      <EmptyState
        title="No Sub Admin yet"
        description="Every college needs one Sub Admin to verify teachers and manage its CRs."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {roles.data.map((role) => (
        <li key={role.id}>
          <RoleRow role={role} />
        </li>
      ))}
    </ul>
  );
}


