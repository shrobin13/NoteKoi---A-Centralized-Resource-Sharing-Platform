"use client";

import { useState } from "react";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { roleLabel } from "../format";
import { useStudents } from "../hooks";

/**
 * S2-F4 — verified students the caller may appoint to a role
 * (`GET /users/students`). Read-only: appointment happens in the form above.
 */
export function StudentDirectory() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const students = useStudents({ q: debouncedSearch || undefined, limit: 50 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Verified students in your scope. Only these accounts can become CR or Co-CR.
        </p>
        <SearchInput
          label="Search students"
          value={search}
          onChange={setSearch}
          placeholder="Name, email or registration number…"
        />
      </div>

      {students.isPending ? <LoadingState label="Loading students…" /> : null}
      {students.isError ? (
        <ErrorState
          title="Could not load students"
          description={students.error instanceof Error ? students.error.message : undefined}
          onRetry={() => void students.refetch()}
        />
      ) : null}
      {students.data && students.data.length === 0 ? (
        <EmptyState
          title="No student found"
          description={
            debouncedSearch
              ? "No verified student matches that search in your scope."
              : "Students appear here once their CR (or you) verifies the registration."
          }
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {students.data?.map((student) => (
          <li key={student.profileId}>
            <Card>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    {student.name} <span className="text-sm text-muted-foreground">({student.regNo})</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{student.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {student.college.name} · {student.department.name} · {student.session.name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {student.includeOtherColleges ? <Badge variant="outline">Cross-college access</Badge> : null}
                  {student.roles.length === 0 ? (
                    <Badge variant="secondary">No role</Badge>
                  ) : (
                    student.roles.map((role) => (
                      <Badge key={role.id} variant="default">
                        {roleLabel(role.role)}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
