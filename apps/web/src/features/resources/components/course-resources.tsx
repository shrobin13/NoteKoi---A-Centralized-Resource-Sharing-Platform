"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useCourseList } from "@/features/academic/hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { RESOURCE_TYPES } from "../schemas";
import { useResourceList } from "../hooks";
import type { ResourceType } from "../types";

const PAGE_SIZE = 12;

const typeLabel = (value: string): string => value.replaceAll("_", " ").toLowerCase();

export function CourseResources({ courseId }: { courseId: string }) {
  const courses = useCourseList({ status: "active" });
  const course = courses.data?.find((row) => row.id === courseId);
  const [search, setSearch] = useState("");
  const [resourceType, setResourceType] = useState<ResourceType | "ALL">("ALL");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");
  const [page, setPage] = useState(1);
  const keyword = useDebouncedValue(search);
  const resources = useResourceList(
    {
      courseId,
      keyword: keyword || undefined,
      resourceType: resourceType === "ALL" ? undefined : resourceType,
      sort,
      page,
      pageSize: PAGE_SIZE,
    },
    courseId.length > 0,
  );

  useEffect(() => {
    setPage(1);
  }, [keyword, resourceType, sort]);

  return (
    <div className="flex flex-col gap-6">
      {courses.isPending ? <LoadingState label="Loading course…" /> : null}
      {courses.isError ? (
        <ErrorState
          title="Could not load course details"
          description={courses.error instanceof Error ? courses.error.message : undefined}
          onRetry={() => void courses.refetch()}
        />
      ) : null}
      {course ? (
        <PageHeader
          title={course.name}
          description={`${course.departmentName}${course.semester ? ` · Semester ${course.semester}` : ""} · Resources`}
        />
      ) : null}
      {courses.data && !course ? <EmptyState title="Course not found" description="This course may be inactive or unavailable." /> : null}

      {course ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <SearchInput
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
              label="Search course resources"
              placeholder="Title, description, or tag"
            />
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <div className="w-full sm:w-48">
                <Select
                  aria-label="Filter by resource type"
                  value={resourceType}
                  onChange={(event) => setResourceType(event.target.value as ResourceType | "ALL")}
                >
                  <option value="ALL">All types</option>
                  {RESOURCE_TYPES.map((value) => (
                    <option key={value} value={value}>{typeLabel(value)}</option>
                  ))}
                </Select>
              </div>
              <div className="w-full sm:w-44">
                <Select
                  aria-label="Sort resources"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as typeof sort)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Title A to Z</option>
                </Select>
              </div>
            </div>
          </div>

          {resources.isPending ? <LoadingState label="Loading resources…" /> : null}
          {resources.isError ? (
            <ErrorState
              title="Could not load course resources"
              description={resources.error instanceof Error ? resources.error.message : undefined}
              onRetry={() => void resources.refetch()}
            />
          ) : null}
          {resources.data && resources.data.items.length === 0 ? (
            <EmptyState title="No resources match these filters" description="Try another search or resource type." />
          ) : null}

          <ul className="grid gap-3 md:grid-cols-2">
            {resources.data?.items.map((resource) => (
              <li key={resource.id}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/resources/${resource.id}?courseId=${encodeURIComponent(courseId)}`}
                        className="min-w-0 text-base font-semibold hover:underline"
                      >
                        {resource.title}
                      </Link>
                      <Badge variant="secondary">{typeLabel(resource.resourceType)}</Badge>
                    </div>
                    <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                      {resource.description || "No description"}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                      <span>{resource.uploader.name} · v{resource.versionNo ?? 1}</span>
                      <Link
                        href={`/resources/${resource.id}?courseId=${encodeURIComponent(courseId)}`}
                        className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                      >
                        Details <ExternalLink className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {resources.data && resources.data.totalPages > 1 ? (
            <nav aria-label="Resource pages" className="flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous page"
                disabled={page <= 1 || resources.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <span className="min-w-28 text-center text-sm text-muted-foreground">
                Page {resources.data.page} of {resources.data.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next page"
                disabled={page >= resources.data.totalPages || resources.isFetching}
                onClick={() => setPage((current) => Math.min(resources.data?.totalPages ?? current, current + 1))}
              >
                <ChevronRight aria-hidden />
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}