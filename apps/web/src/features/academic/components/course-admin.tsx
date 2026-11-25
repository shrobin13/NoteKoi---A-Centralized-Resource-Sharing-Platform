"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api";
import { useCourseList, useCreateCourse, useDeactivateCourse, useDepartmentList, useUpdateCourse } from "../hooks";
import { courseFormSchema, type CourseFormValues } from "../schemas";
import type { CourseView } from "../types";

const SEMESTERS = Array.from({ length: 12 }, (_, index) => index + 1);

const DESCRIPTION_CLASS =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** S2-F2 — Platform Admin course catalogue, scoped to a department. */
export function CourseAdmin() {
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [status, setStatus] = useState<"active" | "all">("active");
  const departments = useDepartmentList({ status: "all" });
  const courses = useCourseList({ departmentId: departmentFilter || undefined, status });
  const createCourse = useCreateCourse();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: { departmentId: "", name: "", description: "", semester: "" },
  });

  useEffect(() => {
    if (departmentFilter) {
      setValue("departmentId", departmentFilter);
    }
  }, [departmentFilter, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createCourse.mutateAsync({
        departmentId: values.departmentId,
        name: values.name,
        description: values.description || undefined,
        semester: values.semester ? Number(values.semester) : undefined,
      });
      reset({ departmentId: values.departmentId, name: "", description: "", semester: "" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Courses"
        description="Courses belong to a department and host the folders and resources students browse. Deactivating keeps every resource and folder intact."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a course</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end" onSubmit={onSubmit} noValidate>
            <FormField id="course-department" label="Department" error={errors.departmentId?.message}>
              <Select id="course-department" {...register("departmentId")}>
                <option value="">Select a department</option>
                {departments.data?.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                    {department.isActive ? "" : " (deactivated)"}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="course-name" label="Course name" error={errors.name?.message}>
              <Input id="course-name" placeholder="e.g. Data Structures" {...register("name")} />
            </FormField>
            <FormField id="course-semester" label="Semester" error={errors.semester?.message} hint="Optional">
              <Select id="course-semester" {...register("semester")}>
                <option value="">Not set</option>
                {SEMESTERS.map((semester) => (
                  <option key={semester} value={semester}>
                    Semester {semester}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create course"}
            </Button>
            <div className="sm:col-span-2 lg:col-span-4">
              <FormField
                id="course-description"
                label="Description"
                error={errors.description?.message}
                hint="Optional"
              >
                <textarea
                  id="course-description"
                  rows={2}
                  placeholder="Short summary shown on the course page"
                  className={DESCRIPTION_CLASS}
                  {...register("description")}
                />
              </FormField>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="w-full sm:w-64">
          <Select
            aria-label="Filter courses by department"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="">All departments</option>
            {departments.data?.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select
            aria-label="Show active or all courses"
            value={status}
            onChange={(event) => setStatus(event.target.value === "all" ? "all" : "active")}
          >
            <option value="active">Active only</option>
            <option value="all">Include deactivated</option>
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
        <EmptyState title="No course found" description="Create the first course above." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {courses.data?.map((course) => (
          <li key={course.id}>
            <CourseAdminRow course={course} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CourseAdminRow({ course }: { course: CourseView }) {
  const updateCourse = useUpdateCourse();
  const deactivateCourse = useDeactivateCourse();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(course.name);
  const [description, setDescription] = useState(course.description ?? "");
  const [semester, setSemester] = useState(course.semester ? String(course.semester) : "");
  const isBusy = updateCourse.isPending || deactivateCourse.isPending;

  const resetFields = () => {
    setName(course.name);
    setDescription(course.description ?? "");
    setSemester(course.semester ? String(course.semester) : "");
    setIsEditing(false);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await updateCourse.mutateAsync({
        courseId: course.id,
        input: {
          name: name.trim(),
          description: description.trim() || null,
          semester: semester ? Number(semester) : null,
        },
      });
      setIsEditing(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const toggleActive = async () => {
    try {
      if (course.isActive) {
        await deactivateCourse.mutateAsync(course.id);
      } else {
        await updateCourse.mutateAsync({ courseId: course.id, input: { isActive: true } });
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        {isEditing ? (
          <form className="flex flex-col gap-3" onSubmit={save}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                Course name
                <Input className="h-9" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-40">
                Semester
                <Select className="h-9" value={semester} onChange={(event) => setSemester(event.target.value)}>
                  <option value="">Not set</option>
                  {SEMESTERS.map((value) => (
                    <option key={value} value={value}>
                      Semester {value}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Description
              <textarea
                rows={2}
                className={DESCRIPTION_CLASS}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={isBusy}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={resetFields}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {course.name}
                  {course.semester ? <span className="text-muted-foreground"> · Semester {course.semester}</span> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {course.departmentName} · {course.folderCount} folder{course.folderCount === 1 ? "" : "s"} ·{" "}
                  {course.resourceCount} resource{course.resourceCount === 1 ? "" : "s"}
                </p>
                {course.description ? (
                  <p className="text-sm text-muted-foreground">{course.description}</p>
                ) : null}
              </div>
              <Badge variant={course.isActive ? "success" : "warning"}>
                {course.isActive ? "Active" : "Deactivated"}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} disabled={isBusy}>
                Edit
              </Button>
              <Button
                size="sm"
                variant={course.isActive ? "destructive" : "secondary"}
                onClick={toggleActive}
                disabled={isBusy}
              >
                {course.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}


