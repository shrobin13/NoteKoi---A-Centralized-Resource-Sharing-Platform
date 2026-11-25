"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/features/users/format";
import { useCourseList, useDepartmentDetail, useDepartmentSessions } from "../hooks";

/** S2-F1 — one department: colleges offering it, its sessions and its courses. */
export function DepartmentDetailView({ departmentId }: { departmentId: string }) {
  const detail = useDepartmentDetail(departmentId);
  const sessions = useDepartmentSessions(departmentId);
  const courses = useCourseList({ departmentId, status: "active" });

  if (detail.isPending) {
    return <LoadingState label="Loading the department…" />;
  }

  if (detail.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <ErrorState
          title="Could not load this department"
          description={detail.error instanceof Error ? detail.error.message : undefined}
          onRetry={() => void detail.refetch()}
        />
      </div>
    );
  }

  const { department, colleges } = detail.data;

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <PageHeader
        title={department.name}
        description={`Offered by ${colleges.length} college${colleges.length === 1 ? "" : "s"} · ${department.sessionCount} session${department.sessionCount === 1 ? "" : "s"} · ${department.courseCount} course${department.courseCount === 1 ? "" : "s"}`}
        actions={
          !department.isActive ? (
            <Badge variant="warning">Deactivated</Badge>
          ) : (
            <Badge variant="success">Active</Badge>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Colleges offering it</CardTitle>
          </CardHeader>
          <CardContent>
            {colleges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No college has adopted this department yet.</p>
            ) : (
              <ul className="divide-y">
                {colleges.map((college) => (
                  <li
                    key={college.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="flex items-center gap-2">
                      <Link className="font-medium hover:underline" href={`/colleges/${college.id}`}>
                        {college.name}
                      </Link>
                      {!college.isActive ? <Badge variant="warning">Deactivated</Badge> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">Since {formatDate(college.adoptedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <SessionsCard sessions={sessions} />
      </div>

      <CoursesCard courses={courses} />
    </div>
  );
}

function SessionsCard({ sessions }: { sessions: ReturnType<typeof useDepartmentSessions> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.isPending ? <LoadingState label="Loading sessions…" /> : null}
        {sessions.isError ? (
          <p className="text-sm text-destructive">Could not load the sessions of this department.</p>
        ) : null}
        {sessions.data && sessions.data.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No session has been created for this department yet.</p>
        ) : null}
        {sessions.data && sessions.data.sessions.length > 0 ? (
          <ul className="divide-y">
            {sessions.data.sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <span className="font-medium">{session.name}</span>
                <span className="text-xs text-muted-foreground">
                  {session.startDate || session.endDate
                    ? `${formatDate(session.startDate)} → ${formatDate(session.endDate)}`
                    : "Dates not set"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CoursesCard({ courses }: { courses: ReturnType<typeof useCourseList> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Courses</CardTitle>
      </CardHeader>
      <CardContent>
        {courses.isPending ? <LoadingState label="Loading courses…" /> : null}
        {courses.isError ? (
          <p className="text-sm text-destructive">Could not load the courses of this department.</p>
        ) : null}
        {courses.data && courses.data.length === 0 ? (
          <EmptyState title="No courses yet" description="A Platform Admin can add the first course of this department." />
        ) : null}
        <ul className="grid gap-3 sm:grid-cols-2">
          {courses.data?.map((course) => (
            <li key={course.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{course.name}</p>
                {course.semester ? <Badge variant="secondary">Sem {course.semester}</Badge> : null}
              </div>
              {course.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {course.resourceCount} resource{course.resourceCount === 1 ? "" : "s"} · {course.folderCount} folder
                {course.folderCount === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="w-fit">
      <Link href="/departments">
        <ArrowLeft aria-hidden />
        All departments
      </Link>
    </Button>
  );
}

