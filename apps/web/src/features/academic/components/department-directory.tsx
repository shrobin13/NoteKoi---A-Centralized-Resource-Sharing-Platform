"use client";

import { ArrowRight, Layers } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useDepartmentList } from "../hooks";

/** S2-F1 — public department directory (global departments, adopted per college). */
export function DepartmentDirectory() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const departments = useDepartmentList({ status: "active", search: debouncedSearch || undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Departments"
        description="Departments are shared across colleges: a college adopts the ones it teaches."
      />
      <SearchInput
        value={search}
        onChange={setSearch}
        label="Search departments by name"
        placeholder="Search departments…"
      />

      {departments.isPending ? <LoadingState label="Loading departments…" /> : null}

      {departments.isError ? (
        <ErrorState
          title="Could not load departments"
          description={departments.error instanceof Error ? departments.error.message : undefined}
          onRetry={() => void departments.refetch()}
        />
      ) : null}

      {departments.data && departments.data.length === 0 ? (
        <EmptyState
          title={debouncedSearch ? "No department matches that search" : "No departments yet"}
          description={debouncedSearch ? "Try a shorter search term." : "A Platform Admin has not added any department yet."}
        />
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {departments.data?.map((department) => (
          <li key={department.id}>
            <Link
              href={`/departments/${department.id}`}
              className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Card className="h-full transition-colors hover:border-primary/60">
                <CardContent className="flex items-start gap-3 p-5">
                  <span className="rounded-md bg-muted p-2 text-muted-foreground">
                    <Layers className="size-4" aria-hidden />
                  </span>
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-medium">{department.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {department.collegeCount} college{department.collegeCount === 1 ? "" : "s"} ·{" "}
                      {department.sessionCount} session{department.sessionCount === 1 ? "" : "s"} ·{" "}
                      {department.courseCount} course{department.courseCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 size-4 text-muted-foreground" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
