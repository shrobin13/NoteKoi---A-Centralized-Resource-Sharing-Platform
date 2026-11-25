"use client";

import { useState } from "react";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { roleLabel } from "../format";
import { useTeachers } from "../hooks";

/**
 * S2-F4 — verified teachers of the caller's college(s)
 * (`GET /users/teachers`). Department assignment happens in the teacher queue.
 */
export function TeacherDirectory() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const teachers = useTeachers({ q: debouncedSearch || undefined, limit: 50 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Verified teachers in your scope. A Sub Admin is always chosen from this list.
        </p>
        <SearchInput
          label="Search teachers"
          value={search}
          onChange={setSearch}
          placeholder="Name or email…"
        />
      </div>

      {teachers.isPending ? <LoadingState label="Loading teachers…" /> : null}
      {teachers.isError ? (
        <ErrorState
          title="Could not load teachers"
          description={teachers.error instanceof Error ? teachers.error.message : undefined}
          onRetry={() => void teachers.refetch()}
        />
      ) : null}
      {teachers.data && teachers.data.length === 0 ? (
        <EmptyState
          title="No teacher found"
          description={
            debouncedSearch
              ? "No verified teacher matches that search in your scope."
              : "Teachers appear here once you approve their registration."
          }
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {teachers.data?.map((teacher) => (
          <li key={teacher.profileId}>
            <Card>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="flex flex-col gap-1">
                  <p className="font-medium">{teacher.name}</p>
                  <p className="text-sm text-muted-foreground">{teacher.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {teacher.college.name} ·{" "}
                    {teacher.departments.length > 0
                      ? teacher.departments.map((department) => department.name).join(", ")
                      : "No department yet"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {teacher.roles.length === 0 ? (
                    <Badge variant="secondary">No role</Badge>
                  ) : (
                    teacher.roles.map((role) => (
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
