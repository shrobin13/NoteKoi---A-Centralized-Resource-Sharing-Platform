"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollegeDetail } from "../hooks";
import { formatDate } from "@/features/users/format";

/** S2-F1 — one college: adopted departments + member counts. */
export function CollegeDetailView({ collegeId }: { collegeId: string }) {
  const detail = useCollegeDetail(collegeId);

  if (detail.isPending) {
    return <LoadingState label="Loading the college…" />;
  }

  if (detail.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState
          title="Could not load this college"
          description={detail.error instanceof Error ? detail.error.message : undefined}
          onRetry={() => void detail.refetch()}
        />
      </div>
    );
  }

  const { college, departments, counts } = detail.data;

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={college.name}
        description={`${departments.length} department${departments.length === 1 ? "" : "s"} offered · ${counts.students} student${counts.students === 1 ? "" : "s"} · ${counts.teachers} teacher${counts.teachers === 1 ? "" : "s"}`}
        actions={
          !college.isActive ? (
            <Badge variant="warning">Deactivated</Badge>
          ) : (
            <Badge variant="success">Active</Badge>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <EmptyState
              title="No departments yet"
              description="This college has not adopted any department. A Platform Admin can add one from the admin screen."
            />
          ) : (
            <ul className="divide-y">
              {departments.map((department) => (
                <li key={department.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-2">
                    <Link className="font-medium hover:underline" href={`/departments/${department.id}`}>
                      {department.name}
                    </Link>
                    {!department.isActive ? <Badge variant="warning">Deactivated</Badge> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">Offered since {formatDate(department.adoptedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Looking for study material instead? Resources arrive in a later slice — this screen only shows the academic
        structure.
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit">
      <Link href="/colleges">
        <ArrowLeft aria-hidden />
        All colleges
      </Link>
    </Button>
  );
}
