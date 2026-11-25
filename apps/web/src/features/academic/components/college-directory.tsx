"use client";

import { ArrowRight, Building2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useCollegeList } from "../hooks";

/** S2-F1 — public college directory (no auth, active colleges only). */
export function CollegeDirectory() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const colleges = useCollegeList({ status: "active", search: debouncedSearch || undefined });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Colleges"
        description="Every college on NoteKoi, with the departments each one offers."
      />
      <SearchInput value={search} onChange={setSearch} label="Search colleges by name" placeholder="Search colleges…" />

      {colleges.isPending ? <LoadingState label="Loading colleges…" /> : null}

      {colleges.isError ? (
        <ErrorState
          title="Could not load colleges"
          description="The NoteKoi API did not answer. Check your connection and try again."
          onRetry={() => void colleges.refetch()}
        />
      ) : null}

      {colleges.data && colleges.data.length === 0 ? (
        <EmptyState
          title={debouncedSearch ? "No college matches that search" : "No colleges yet"}
          description={
            debouncedSearch
              ? "Try a shorter search term."
              : "A Platform Admin has not added any college yet."
          }
        />
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {colleges.data?.map((college) => (
          <li key={college.id}>
            <Link href={`/colleges/${college.id}`} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg">
              <Card className="h-full transition-colors hover:border-primary/60">
                <CardContent className="flex items-start gap-3 p-5">
                  <span className="rounded-md bg-muted p-2 text-muted-foreground">
                    <Building2 className="size-4" aria-hidden />
                  </span>
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="font-medium">{college.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {college.departmentCount} department{college.departmentCount === 1 ? "" : "s"} ·{" "}
                      {college.studentCount} student{college.studentCount === 1 ? "" : "s"}
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
