"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useCourseList, useDepartmentList } from "../hooks";

const SEMESTERS = Array.from({ length: 12 }, (_, index) => index + 1);

/** S2-F1 — public course directory, filterable by department and semester. */
export function CourseDirectory() {
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [semester, setSemester] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const departments = useDepartmentList({ status: "active" });
  const courses = useCourseList({
    status: "active",
    search: debouncedSearch || undefined,
    departmentId: departmentId || undefined,
    semester: semester ? Number(semester) : undefined,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Courses" description="Every active course, grouped by the department that owns it." />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <SearchInput value={search} onChange={setSearch} label="Search courses by name" placeholder="Search courses…" />
        <div className="w-full sm:w-64">
          <Select
            aria-label="Filter by department"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">All departments</option>
            {departments.data?.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-40">
          <Select aria-label="Filter by semester" value={semester} onChange={(event) => setSemester(event.target.value)}>
            <option value="">Any semester</option>
            {SEMESTERS.map((value) => (
              <option key={value} value={value}>
                Semester {value}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {courses.isPending ? <LoadingState label="Loading courses…" /> : null}

      {courses.isError ? (
        <ErrorState
          title="Could not load courses"
          description={courses.error instanceof Error ? courses.error.message : undefined}
          onRetry={() => void courses.refetch()}
        />
      ) : null}

      {courses.data && courses.data.length === 0 ? (
        <EmptyState
          title="No course matches these filters"
          description="A Platform Admin adds courses; try clearing the search or the filters."
        />
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {courses.data?.map((course) => (
          <li key={course.id}>
            <Card className="h-full">
              <CardContent className="flex h-full flex-col gap-2 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{course.name}</p>
                  {course.semester ? <Badge variant="secondary">Sem {course.semester}</Badge> : null}
                </div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{course.departmentName}</p>
                {course.description ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">{course.description}</p>
                ) : null}
                <p className="mt-auto pt-2 text-xs text-muted-foreground">
                  {course.resourceCount} resource{course.resourceCount === 1 ? "" : "s"} · {course.folderCount} folder
                  {course.folderCount === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
