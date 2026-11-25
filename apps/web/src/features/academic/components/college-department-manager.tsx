"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api";
import { useAdoptCollegeDepartment, useCollegeDetail, useDepartmentList, useDropCollegeDepartment } from "../hooks";

/** S2-F2 — adopt / drop the departments a college offers (adoption is per college). */
export function CollegeDepartmentManager({ collegeId }: { collegeId: string }) {
  const detail = useCollegeDetail(collegeId);
  const departments = useDepartmentList({ status: "active" });
  const adopt = useAdoptCollegeDepartment();
  const drop = useDropCollegeDepartment();
  const [departmentId, setDepartmentId] = useState("");

  const adoptedIds = new Set(detail.data?.departments.map((department) => department.id) ?? []);
  const available = (departments.data ?? []).filter((department) => !adoptedIds.has(department.id));

  const handleAdopt = async () => {
    if (!departmentId) return;

    try {
      await adopt.mutateAsync({ collegeId, departmentId });
      setDepartmentId("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleDrop = async (id: string) => {
    try {
      await drop.mutateAsync({ collegeId, departmentId: id });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
      <p className="text-sm font-medium">Departments offered</p>

      {detail.isPending ? <LoadingState label="Loading adopted departments…" /> : null}
      {detail.isError ? <p className="text-sm text-destructive">Could not load the adopted departments.</p> : null}

      {detail.data && detail.data.departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">This college has not adopted any department yet.</p>
      ) : null}

      {detail.data && detail.data.departments.length > 0 ? (
        <ul className="divide-y rounded-md border bg-background">
          {detail.data.departments.map((department) => (
            <li key={department.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                {department.name}
                {!department.isActive ? <Badge variant="warning">Deactivated</Badge> : null}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleDrop(department.id)}
                disabled={drop.isPending}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          aria-label="Department to adopt"
          className="sm:max-w-xs"
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
          disabled={departments.isPending || available.length === 0}
        >
          <option value="">{available.length === 0 ? "All departments adopted" : "Select a department"}</option>
          {available.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={handleAdopt} disabled={!departmentId || adopt.isPending}>
          {adopt.isPending ? "Adopting…" : "Adopt department"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Removing a department is refused while students or resources still point at it — deactivate it instead.
      </p>
    </div>
  );
}
