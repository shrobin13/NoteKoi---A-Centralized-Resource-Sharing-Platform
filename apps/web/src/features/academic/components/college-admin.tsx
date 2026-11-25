"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useCollegeList, useCreateCollege, useUpdateCollege, useDeactivateCollege } from "../hooks";
import { collegeFormSchema, type CollegeFormValues } from "../schemas";
import type { CollegeView } from "../types";
import { CollegeDepartmentManager } from "./college-department-manager";

/** S2-F2 — Platform Admin college CRUD (soft delete: deactivate, never remove). */
export function CollegeAdmin() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "all">("active");
  const debouncedSearch = useDebouncedValue(search);
  const colleges = useCollegeList({ status, search: debouncedSearch || undefined });
  const createCollege = useCreateCollege();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CollegeFormValues>({
    resolver: zodResolver(collegeFormSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createCollege.mutateAsync({ name: values.name });
      reset({ name: "" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Colleges"
        description="Create colleges and choose the departments each one offers. Deactivating a college hides it from public lists but keeps all its data."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a college</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col items-start gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit} noValidate>
            <div className="w-full sm:max-w-sm">
              <FormField id="college-name" label="College name" error={errors.name?.message}>
                <Input id="college-name" placeholder="e.g. Dhaka College" {...register("name")} />
              </FormField>
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create college"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} label="Search colleges" placeholder="Search colleges…" />
        <div className="w-full sm:w-48">
          <Select
            aria-label="Show active or all colleges"
            value={status}
            onChange={(event) => setStatus(event.target.value === "all" ? "all" : "active")}
          >
            <option value="active">Active only</option>
            <option value="all">Include deactivated</option>
          </Select>
        </div>
      </div>

      {colleges.isPending ? <LoadingState label="Loading colleges…" /> : null}
      {colleges.isError ? (
        <ErrorState
          title="Could not load colleges"
          description={colleges.error instanceof Error ? colleges.error.message : undefined}
          onRetry={() => void colleges.refetch()}
        />
      ) : null}
      {colleges.data && colleges.data.length === 0 ? (
        <EmptyState title="No college found" description="Create the first college above." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {colleges.data?.map((college) => (
          <li key={college.id}>
            <CollegeAdminRow college={college} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CollegeAdminRow({ college }: { college: CollegeView }) {
  const updateCollege = useUpdateCollege();
  const deactivateCollege = useDeactivateCollege();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(college.name);
  const [showDepartments, setShowDepartments] = useState(false);
  const isBusy = updateCollege.isPending || deactivateCollege.isPending;

  const saveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = name.trim();

    if (trimmed === college.name) {
      setIsEditing(false);
      return;
    }

    try {
      await updateCollege.mutateAsync({ collegeId: college.id, input: { name: trimmed } });
      setIsEditing(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const toggleActive = async () => {
    try {
      if (college.isActive) {
        await deactivateCollege.mutateAsync(college.id);
      } else {
        await updateCollege.mutateAsync({ collegeId: college.id, input: { isActive: true } });
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            {isEditing ? (
              <form className="flex flex-wrap items-center gap-2" onSubmit={saveName}>
                <Input
                  aria-label="College name"
                  className="h-9 w-64"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Button type="submit" size="sm" disabled={isBusy}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setName(college.name);
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <p className="font-medium">{college.name}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {college.departmentCount} department{college.departmentCount === 1 ? "" : "s"} ·{" "}
              {college.studentCount} student{college.studentCount === 1 ? "" : "s"}
            </p>
          </div>
          <Badge variant={college.isActive ? "success" : "warning"}>
            {college.isActive ? "Active" : "Deactivated"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isEditing ? (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} disabled={isBusy}>
              Rename
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setShowDepartments((value) => !value)}>
            {showDepartments ? "Hide departments" : "Departments"}
          </Button>
          <Button size="sm" variant={college.isActive ? "destructive" : "secondary"} onClick={toggleActive} disabled={isBusy}>
            {college.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </div>

        {college.isActive ? null : (
          <p className="text-xs text-muted-foreground">
            Deactivated colleges are hidden from public lists. Students and teachers already attached stay attached.
          </p>
        )}

        {showDepartments ? <CollegeDepartmentManager collegeId={college.id} /> : null}
      </CardContent>
    </Card>
  );
}

