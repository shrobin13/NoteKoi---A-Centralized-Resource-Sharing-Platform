"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useMe } from "@/features/auth/hooks/use-auth";
import { useSemester, useSemesters } from "@/features/academic/semester-hooks";
import { getErrorMessage } from "@/lib/api";
import { resourceUploadSchema, type ResourceUploadInput } from "../schemas";
import { useUploadResource } from "../hooks";

const FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg";

export function ResourceUploadForm() {
  const me = useMe();
  const user = me.data;
  const profile = user?.profile;
  const isStudent = profile?.kind === "student";
  const isTeacher = profile?.kind === "teacher";
  const canUpload = Boolean(profile && profile.verificationStatus === "ACTIVE" && (isStudent || isTeacher));
  const semesters = useSemesters(canUpload);
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const upload = useUploadResource();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canPublishPlatform = user?.roles.some((role) => role.role === "CR" || role.role === "CO_CR") ?? false;
  const activeProfile = canUpload;

  const form = useForm<ResourceUploadInput>({
    resolver: zodResolver(resourceUploadSchema),
    defaultValues: {
      title: "",
      description: "",
      tags: "",
      resourceType: "NOTES",
      courseId: "",
      semesterCourseId: "",
      categoryId: "",
      audience: "COLLEGE",
    },
  });

  const selectedSemester = useSemester(selectedSemesterId);
  const selectedSemesterCourseId = form.watch("semesterCourseId");
  const selectedSemesterCourse = selectedSemester.data?.courses.find((item) => item.id === selectedSemesterCourseId);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("semesterId");
    const initial = semesters.data?.find((item) => item.id === requested) ?? semesters.data?.[0];
    if (initial && !selectedSemesterId) setSelectedSemesterId(initial.id);
  }, [selectedSemesterId, semesters.data]);

  useEffect(() => {
    form.setValue("courseId", selectedSemesterCourse?.courseId ?? "");
  }, [form, selectedSemesterCourse]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedCourseId = params.get("semesterCourseId");
    const requestedCategoryId = params.get("categoryId");
    if (requestedCourseId && selectedSemester.data?.courses.some((course) => course.id === requestedCourseId)) {
      form.setValue("semesterCourseId", requestedCourseId);
      if (requestedCategoryId) form.setValue("categoryId", requestedCategoryId);
    }
  }, [form, selectedSemester.data]);

  useEffect(() => {
    if (isTeacher) form.setValue("audience", "PRIVATE");
    else if (isStudent) form.setValue("audience", "COLLEGE");
  }, [form.setValue, isStudent, isTeacher]);

  const onSubmit = form.handleSubmit(async (input) => {
    if (!activeProfile) return;
    if (!file) {
      toast.error("Choose a file to upload");
      return;
    }

    setIsSubmitting(true);
    try {
      await upload.mutateAsync({ input, file });
      form.reset({
        title: "",
        description: "",
        tags: "",
        resourceType: "NOTES",
        courseId: "",
        semesterCourseId: "",
        categoryId: "",
        audience: isTeacher ? "PRIVATE" : "COLLEGE",
      });
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  if (!user) return null;

  if (!isStudent && !isTeacher) {
    return (
      <Alert variant="warning">
        <AlertTitle>Upload profile required</AlertTitle>
        <AlertDescription>Resource uploads require an active student or teacher profile.</AlertDescription>
      </Alert>
    );
  }

  if (!activeProfile) {
    return (
      <Alert variant={profile?.verificationStatus === "REJECTED" ? "destructive" : "warning"}>
        <AlertTitle>Profile verification required</AlertTitle>
        <AlertDescription>
          {profile?.verificationStatus === "REJECTED"
            ? (profile.rejectedReason ?? "Contact your college administrator for details.")
            : isTeacher
              ? "Your college Sub Admin must verify your profile before you can upload."
              : "Your class representative must verify your profile before you can upload."}
        </AlertDescription>
      </Alert>
    );
  }

  const scopeLabel = isStudent
    ? `${profile.department.name} · ${profile.session.name}`
    : `${profile.college.name} · ${profile.departments.map((department) => department.name).join(", ")}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Upload a resource" description={scopeLabel} />

      {semesters.isPending ? <LoadingState label="Loading semesters…" /> : null}
      {semesters.isError ? (
        <ErrorState
          title="Could not load semesters"
          description={semesters.error instanceof Error ? semesters.error.message : undefined}
          onRetry={() => void semesters.refetch()}
        />
      ) : null}
      {semesters.data?.length === 0 ? (
        <EmptyState title="No semesters available" description="Ask your class representative to create a semester." />
      ) : null}

      {semesters.data && semesters.data.length > 0 ? (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <form className="grid gap-5 md:grid-cols-2" onSubmit={onSubmit} noValidate>
              <FormField id="resource-title" label="Title" error={form.formState.errors.title?.message}>
                <Input id="resource-title" autoComplete="off" {...form.register("title")} />
              </FormField>
              <FormField id="resource-semester" label="Semester">
                <Select id="resource-semester" value={selectedSemesterId} onChange={(event) => { setSelectedSemesterId(event.target.value); form.setValue("semesterCourseId", ""); form.setValue("categoryId", ""); form.setValue("courseId", ""); }}>
                  <option value="">Choose a semester</option>
                  {semesters.data.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
                </Select>
              </FormField>
              <FormField id="resource-course" label="Course" error={form.formState.errors.semesterCourseId?.message}>
                <Select id="resource-course" {...form.register("semesterCourseId", { onChange: () => { form.setValue("categoryId", ""); } })} disabled={!selectedSemesterId || selectedSemester.isPending}>
                  <option value="">Choose a course</option>
                  {selectedSemester.data?.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </Select>
              </FormField>
              <FormField id="resource-category" label="Category" error={form.formState.errors.categoryId?.message}>
                <Select id="resource-category" {...form.register("categoryId")} disabled={!selectedSemesterCourseId}>
                  <option value="">Choose a category</option>
                  {selectedSemesterCourse?.categories.filter((category) => !category.isSystem).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </Select>
              </FormField>
              <FormField id="resource-type" label="Resource type" error={form.formState.errors.resourceType?.message}>
                <Select id="resource-type" {...form.register("resourceType")}>
                  <option value="NOTES">Notes</option>
                  <option value="SLIDES">Slides</option>
                  <option value="ASSIGNMENT">Assignment</option>
                  <option value="QUESTION_BANK">Question bank</option>
                  <option value="BOOK">Book</option>
                  <option value="OTHER">Other</option>
                </Select>
              </FormField>
              <FormField id="resource-audience" label="Audience" error={form.formState.errors.audience?.message}>
                <Select id="resource-audience" {...form.register("audience")}>
                  {isTeacher ? <option value="PRIVATE">Private</option> : <option value="COLLEGE">My college</option>}
                  {canPublishPlatform ? <option value="PLATFORM">Everyone</option> : null}
                </Select>
              </FormField>
              <div className="md:col-span-2">
                <FormField id="resource-description" label="Description" hint="Optional" error={form.formState.errors.description?.message}>
                  <textarea
                    id="resource-description"
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    {...form.register("description")}
                  />
                </FormField>
              </div>
              <div className="md:col-span-2">
                <FormField id="resource-tags" label="Tags" hint="Optional · comma-separated" error={form.formState.errors.tags?.message}>
                  <Input id="resource-tags" placeholder="calculus, midterm" {...form.register("tags")} />
                </FormField>
              </div>
              <div className="md:col-span-2">
                <FormField id="resource-file" label="File" hint="PDF, Word, PowerPoint, or image">
                  <Input
                    ref={fileInput}
                    id="resource-file"
                    type="file"
                    accept={FILE_ACCEPT}
                    onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
                    className="h-auto py-2 file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium"
                  />
                  {file ? <span className="mt-1 text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span> : null}
                </FormField>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={isSubmitting || upload.isPending || semesters.isPending || selectedSemester.isPending}>
                  <FileUp aria-hidden />
                  {isSubmitting ? "Uploading…" : "Upload resource"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}