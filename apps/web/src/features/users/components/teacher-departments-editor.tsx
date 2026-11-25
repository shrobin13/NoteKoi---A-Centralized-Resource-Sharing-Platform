"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { useCollegeDetail } from "@/features/academic/hooks";
import { getErrorMessage } from "@/lib/api";
import type { EntityRef } from "@/features/auth/types";
import { useAssignTeacherDepartments } from "../hooks";

/**
 * S2-F3 — `PUT /users/teachers/:profileId/departments` replaces the whole list,
 * so the editor starts from the currently assigned departments.
 */
export function TeacherDepartmentsEditor({
  profileId,
  collegeId,
  current,
  onDone,
}: {
  profileId: string;
  collegeId: string;
  current: EntityRef[];
  onDone: () => void;
}) {
  const college = useCollegeDetail(collegeId);
  const assign = useAssignTeacherDepartments();
  const [selected, setSelected] = useState<string[]>(current.map((department) => department.id));
  const [error, setError] = useState<string | null>(null);

  const toggle = (departmentId: string) => {
    setSelected((value) =>
      value.includes(departmentId) ? value.filter((id) => id !== departmentId) : [...value, departmentId],
    );
  };

  const handleSave = async () => {
    if (selected.length === 0) {
      setError("Pick at least one department");
      return;
    }

    if (selected.length > 20) {
      setError("A teacher can belong to at most 20 departments");
      return;
    }

    setError(null);

    try {
      await assign.mutateAsync({ profileId, departmentIds: selected });
      onDone();
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
      <p className="text-sm font-medium">Departments this teacher belongs to</p>

      {college.isPending ? <LoadingState label="Loading the college departments…" /> : null}
      {college.isError ? (
        <p className="text-sm text-destructive">
          {college.error instanceof Error ? college.error.message : "Could not load departments."}
        </p>
      ) : null}

      {college.data ? (
        college.data.departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {college.data.college.name} has not adopted any department yet.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {college.data.departments.map((department) => (
              <label key={department.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-input"
                  checked={selected.includes(department.id)}
                  onChange={() => toggle(department.id)}
                  disabled={!department.isActive}
                />
                {department.name}
                {department.isActive ? "" : " (deactivated)"}
              </label>
            ))}
          </div>
        )
      ) : null}

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={assign.isPending || !college.data}>
          {assign.isPending ? "Saving…" : "Save departments"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
