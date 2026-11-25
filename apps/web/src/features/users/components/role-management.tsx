"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { formatDate, roleLabel, scopeLabel } from "../format";
import { useAppointCr, useRevokeRole, useRoles, useStudents } from "../hooks";
import type { RoleAssignment, StudentDirectoryItem } from "../types";

const FILTERS = [
  { value: "", label: "All roles" },
  { value: "CR", label: "CR" },
  { value: "CO_CR", label: "Co-CR" },
  { value: "SUB_ADMIN", label: "Sub Admin" },
] as const;

export const INPUT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** S2-F4 — appoint CR / Co-CR of a batch and revoke any role in scope. */
export function RoleManagement() {
  const [filter, setFilter] = useState<"" | "CR" | "CO_CR" | "SUB_ADMIN">("");
  const roles = useRoles({ role: filter || undefined });

  return (
    <div className="flex flex-col gap-6">
      <AppointCrForm />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Active role assignments</h2>
        <div className="w-full sm:w-48">
          <Select
            aria-label="Filter roles"
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {roles.isPending ? <LoadingState label="Loading role assignments…" /> : null}
      {roles.isError ? (
        <ErrorState
          title="Could not load role assignments"
          description={roles.error instanceof Error ? roles.error.message : undefined}
          onRetry={() => void roles.refetch()}
        />
      ) : null}
      {roles.data && roles.data.length === 0 ? (
        <EmptyState
          title="No role assignment found"
          description="Appoint a CR above, or clear the filter to see every role in your scope."
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {roles.data?.map((role) => (
          <li key={role.id}>
            <RoleRow role={role} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppointCrForm() {
  const appointCr = useAppointCr();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StudentDirectoryItem | null>(null);
  const [role, setRole] = useState<"CR" | "CO_CR">("CR");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search);
  const students = useStudents({ q: debouncedSearch || undefined, limit: 25 });

  const reset = () => {
    setSelected(null);
    setSearch("");
    setRole("CR");
    setExpiresAt("");
    setReason("");
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selected) {
      setError("Pick the student who should become the representative");
      return;
    }

    setError(null);

    try {
      await appointCr.mutateAsync({
        userId: selected.userId,
        role,
        collegeId: selected.college.id,
        departmentId: selected.department.id,
        sessionId: selected.session.id,
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
        <CardTitle>Appoint a CR or Co-CR</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <SearchInput
              label="Find a student"
              value={search}
              onChange={setSearch}
              placeholder="Search by name or registration number…"
            />
            {students.isPending ? <p className="text-sm text-muted-foreground">Searching…</p> : null}
            {students.isError ? (
              <p className="text-sm text-destructive">
                {students.error instanceof Error ? students.error.message : "Could not load students."}
              </p>
            ) : null}
            <Select
              aria-label="Student to appoint"
              value={selected?.userId ?? ""}
              onChange={(event) => {
                const next = students.data?.find((student) => student.userId === event.target.value) ?? null;
                setSelected(next);
              }}
              disabled={!students.data || students.data.length === 0}
            >
              <option value="">
                {students.data && students.data.length === 0 ? "No student found" : "Select a student"}
              </option>
              {students.data?.map((student) => (
                <option key={student.userId} value={student.userId}>
                  {student.name} · {student.regNo} · {student.department.name} · {student.session.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Role
              <Select value={role} onChange={(event) => setRole(event.target.value === "CO_CR" ? "CO_CR" : "CR")}>
                <option value="CR">CR</option>
                <option value="CO_CR">Co-CR</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Expires (optional)
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Reason (optional)
              <input
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this appointment made?"
                className={INPUT_CLASS}
                maxLength={300}
              />
            </label>
          </div>

          <p className="text-sm text-muted-foreground">
            {selected
              ? `Scope: ${selected.college.name} → ${selected.department.name} → ${selected.session.name}`
              : "The appointment takes the college, department and session of the selected student (A.2)."}
          </p>

          {error ? <FieldError>{error}</FieldError> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={appointCr.isPending}>
              {appointCr.isPending ? "Appointing…" : `Appoint ${role === "CO_CR" ? "Co-CR" : "CR"}`}
            </Button>
            <Button type="button" variant="ghost" onClick={reset} disabled={appointCr.isPending}>
              Clear
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            A batch holds one CR and one Co-CR. Appointing over an active holder is refused with{" "}
            <span className="font-mono">ROLE_SLOT_TAKEN</span> — revoke the old role first.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export function RoleRow({ role }: { role: RoleAssignment }) {
  const revoke = useRevokeRole();
  const [isRevoking, setIsRevoking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (reason.trim().length < 5) {
      setError("Give the reason (at least 5 characters) so the audit trail is useful");
      return;
    }

    setError(null);

    try {
      await revoke.mutateAsync({ roleId: role.id, reason: reason.trim() });
      setIsRevoking(false);
      setReason("");
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      setError(message);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{role.name}</p>
              <Badge variant={role.role === "SUB_ADMIN" ? "default" : "secondary"}>{roleLabel(role.role)}</Badge>
              {role.appointmentType === "EMERGENCY" ? <Badge variant="destructive">Emergency</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">{role.email}</p>
            <p className="text-sm text-muted-foreground">{scopeLabel(role)}</p>
            <p className="text-xs text-muted-foreground">
              Since {formatDate(role.assignedAt)} · {role.expiresAt ? `Expires ${formatDate(role.expiresAt)}` : "No expiry"}
            </p>
          </div>
          {isRevoking ? null : (
            <Button size="sm" variant="outline" onClick={() => setIsRevoking(true)}>
              Revoke role
            </Button>
          )}
        </div>

        {isRevoking ? (
          <form className="flex flex-col gap-2 rounded-md border bg-muted/30 p-4" onSubmit={handleRevoke} noValidate>
            <p className="text-sm font-medium">
              Revoke {roleLabel(role.role)} from {role.name}
            </p>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (required, 5–500 characters)"
              className={INPUT_CLASS}
              aria-label="Revocation reason"
              maxLength={500}
            />
            {error ? <FieldError>{error}</FieldError> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="destructive" disabled={revoke.isPending}>
                {revoke.isPending ? "Revoking…" : "Confirm revocation"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsRevoking(false);
                  setReason("");
                  setError(null);
                }}
                disabled={revoke.isPending}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Revocation keeps the row and the audit trail; the person simply stops holding the role.
            </p>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}



