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
import { formatDate } from "@/features/users/format";
import {
  useCreateSession,
  useDeactivateSession,
  useDepartmentList,
  useSessionList,
  useUpdateSession,
} from "../hooks";
import { sessionFormSchema, type SessionFormValues } from "../schemas";
import type { SessionView } from "../types";

/** S2-F2 — Platform Admin sessions, always scoped to one department. */
export function SessionAdmin() {
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [status, setStatus] = useState<"active" | "all">("active");
  const departments = useDepartmentList({ status: "all" });
  const sessions = useSessionList({ departmentId: departmentFilter || undefined, status });
  const createSession = useCreateSession();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: { departmentId: "", name: "", startDate: "", endDate: "" },
  });

  useEffect(() => {
    if (departmentFilter) {
      setValue("departmentId", departmentFilter);
    }
  }, [departmentFilter, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createSession.mutateAsync({
        departmentId: values.departmentId,
        name: values.name,
        startDate: values.startDate || undefined,
        endDate: values.endDate || undefined,
      });
      reset({ departmentId: values.departmentId, name: "", startDate: "", endDate: "" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sessions"
        description="A session (batch) belongs to exactly one department. Deactivating keeps every student attached to it."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a session</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end" onSubmit={onSubmit} noValidate>
            <FormField id="session-department" label="Department" error={errors.departmentId?.message}>
              <Select id="session-department" {...register("departmentId")}>
                <option value="">Select a department</option>
                {departments.data?.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                    {department.isActive ? "" : " (deactivated)"}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="session-name" label="Session name" error={errors.name?.message}>
              <Input id="session-name" placeholder="e.g. 2023-2024" {...register("name")} />
            </FormField>
            <FormField id="session-start" label="Start date" error={errors.startDate?.message} hint="Optional">
              <Input id="session-start" type="date" {...register("startDate")} />
            </FormField>
            <FormField id="session-end" label="End date" error={errors.endDate?.message} hint="Optional">
              <Input id="session-end" type="date" {...register("endDate")} />
            </FormField>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create session"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="w-full sm:w-64">
          <Select
            aria-label="Filter sessions by department"
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
            aria-label="Show active or all sessions"
            value={status}
            onChange={(event) => setStatus(event.target.value === "all" ? "all" : "active")}
          >
            <option value="active">Active only</option>
            <option value="all">Include deactivated</option>
          </Select>
        </div>
      </div>

      {sessions.isPending ? <LoadingState label="Loading sessions…" /> : null}
      {sessions.isError ? (
        <ErrorState
          title="Could not load sessions"
          description={sessions.error instanceof Error ? sessions.error.message : undefined}
          onRetry={() => void sessions.refetch()}
        />
      ) : null}
      {sessions.data && sessions.data.length === 0 ? (
        <EmptyState title="No session found" description="Create the first session above." />
      ) : null}

      <ul className="flex flex-col gap-3">
        {sessions.data?.map((session) => (
          <li key={session.id}>
            <SessionAdminRow session={session} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionAdminRow({ session }: { session: SessionView }) {
  const updateSession = useUpdateSession();
  const deactivateSession = useDeactivateSession();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(session.name);
  const [startDate, setStartDate] = useState(session.startDate ?? "");
  const [endDate, setEndDate] = useState(session.endDate ?? "");
  const isBusy = updateSession.isPending || deactivateSession.isPending;

  const resetFields = () => {
    setName(session.name);
    setStartDate(session.startDate ?? "");
    setEndDate(session.endDate ?? "");
    setIsEditing(false);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await updateSession.mutateAsync({
        sessionId: session.id,
        input: {
          name: name.trim(),
          startDate: startDate || null,
          endDate: endDate || null,
        },
      });
      setIsEditing(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const toggleActive = async () => {
    try {
      if (session.isActive) {
        await deactivateSession.mutateAsync(session.id);
      } else {
        await updateSession.mutateAsync({ sessionId: session.id, input: { isActive: true } });
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
              <form className="flex flex-wrap items-end gap-2" onSubmit={save}>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground" htmlFor={`session-name-${session.id}`}>
                    Name
                  </label>
                  <Input
                    id={`session-name-${session.id}`}
                    className="h-9 w-48"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground" htmlFor={`session-start-${session.id}`}>
                    Start
                  </label>
                  <Input
                    id={`session-start-${session.id}`}
                    type="date"
                    className="h-9 w-40"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground" htmlFor={`session-end-${session.id}`}>
                    End
                  </label>
                  <Input
                    id={`session-end-${session.id}`}
                    type="date"
                    className="h-9 w-40"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" disabled={isBusy}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={resetFields}>
                  Cancel
                </Button>
              </form>
            ) : (
              <p className="font-medium">{session.name}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {session.departmentName} · {formatDate(session.startDate)} → {formatDate(session.endDate)} ·{" "}
              {session.studentCount} student{session.studentCount === 1 ? "" : "s"}
            </p>
          </div>
          <Badge variant={session.isActive ? "success" : "warning"}>
            {session.isActive ? "Active" : "Deactivated"}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isEditing ? (
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} disabled={isBusy}>
              Edit
            </Button>
          ) : null}
          <Button size="sm" variant={session.isActive ? "destructive" : "secondary"} onClick={toggleActive} disabled={isBusy}>
            {session.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

