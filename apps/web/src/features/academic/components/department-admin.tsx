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
import { useCreateDepartment, useDeactivateDepartment, useDepartmentList, useUpdateDepartment } from "../hooks";
import { departmentFormSchema, type DepartmentFormValues } from "../schemas";
import type { DepartmentView } from "../types";

/** S2-F2 — Platform Admin department catalogue (global names, soft delete). */
export function DepartmentAdmin() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"active" | "all">("active");
  const debouncedSearch = useDebouncedValue(search);
  const departments = useDepartmentList({ status, search: debouncedSearch || undefined });
  const createDepartment = useCreateDepartment();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createDepartment.mutateAsync({ name: values.name });
      reset({ name: "" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Departments"
        description="Department names are global and unique: colleges adopt them instead of creating their own copy. Deactivating hides a department from public lists without deleting anything."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a department</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col items-start gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit} noValidate>
            <div className="w-full sm:max-w-sm">
              <FormField id="department-name" label="Department name" error={errors.name?.message}>
                <Input id="department-name" placeholder="e.g. Computer Science" {...register("name")} />
              </FormField>
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create department"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={setSearch} label="Search departments" placeholder="Search departments…" />
        <div className="w-full sm:w-48">
          <Select
            aria-label="Show active or all departments"
            value={status}
            onChange={(event) => setStatus(event.target.value === "all" ? "all" : "active")}
          >
            <option value="active">Active only</option>
            <option value="all">Include deactivated</option>
          </Select>
        </div>
      </div>

      {departments.isPending ? <LoadingState label="Loading departments…" /> : null}
      {departments.isError ? (
        <ErrorState
          title="Could not load departments"
          description={departments.error instanceof Error ? departments.error.message : undefined}
          onRetry={() => void departments.refetch()}
        />
      ) : null}
      {departments.data && departments.data.length === 0 ? (
        <EmptyState title="No department found" description="Create the first department above." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {departments.data?.map((department) => (
          <li key={department.id}>
            <DepartmentAdminRow department={department} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function DepartmentAdminRow({ department }: { department: DepartmentView }) {
  const updateDepartment = useUpdateDepartment();
  const deactivateDepartment = useDeactivateDepartment();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(department.name);
  const isBusy = updateDepartment.isPending || deactivateDepartment.isPending;

  const saveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = name.trim();

    if (trimmed === department.name) {
      setIsEditing(false);
      return;
    }

    try {
      await updateDepartment.mutateAsync({ departmentId: department.id, input: { name: trimmed } });
      setIsEditing(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const toggleActive = async () => {
    try {
      if (department.isActive) {
        await deactivateDepartment.mutateAsync(department.id);
      } else {
        await updateDepartment.mutateAsync({ departmentId: department.id, input: { isActive: true } });
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
                  aria-label="Department name"
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
                    setName(department.name);
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <p className="font-medium">{department.name}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {department.collegeCount} college{department.collegeCount === 1 ? "" : "s"} ·{" "}
              {department.sessionCount} session{department.sessionCount === 1 ? "" : "s"} ·{" "}
              {department.courseCount} course{department.courseCount === 1 ? "" : "s"} ·{" "}
              {department.studentCount} student{department.studentCount === 1 ? "" : "s"}
            </p>
          </div>
          <Badge variant={department.isActive ? "success" : "warning"}>
            {department.isActive ? "Active" : "Deactivated"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isEditing ? (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} disabled={isBusy}>
              Rename
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={department.isActive ? "destructive" : "secondary"}
            onClick={toggleActive}
            disabled={isBusy}
          >
            {department.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

