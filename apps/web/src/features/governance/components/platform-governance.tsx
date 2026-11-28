"use client";

import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/api";
import {
  useAuditLogs,
  useDecideEscalation,
  useFetchEscalations,
  useOverrideResourceDelete,
  useOverrideResourceUpdate,
  useRevokePlatformResource,
} from "../hooks";

export function PlatformGovernance({ platformAdmin }: { platformAdmin: boolean }) {
  const escalations = useFetchEscalations();
  const decide = useDecideEscalation();
  const revoke = useRevokePlatformResource();
  const auditLogs = useAuditLogs(platformAdmin);
  const overrideUpdate = useOverrideResourceUpdate();
  const overrideDelete = useOverrideResourceDelete();
  const [revokeId, setRevokeId] = useState("");
  const [overrideId, setOverrideId] = useState("");
  const [justification, setJustification] = useState("");
  const [title, setTitle] = useState("");

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const revokeResource = async () => {
    if (!revokeId) return;
    await run(() => revoke.mutateAsync(revokeId));
  };

  const submitOverride = async (operation: "update" | "delete") => {
    if (!overrideId || justification.trim().length < 10) {
      toast.error("Provide a resource id and a justification of at least 10 characters");
      return;
    }
    await run(() => operation === "delete"
      ? overrideDelete.mutateAsync({ id: overrideId, justification: justification.trim() })
      : overrideUpdate.mutateAsync({ id: overrideId, justification: justification.trim(), patch: title.trim() ? { title: title.trim() } : {} }));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-lg">Escalations</CardTitle></CardHeader>
        <CardContent>
          {escalations.isPending ? <LoadingState label="Loading escalations…" /> : null}
          {escalations.isError ? <ErrorState title="Could not load escalations" onRetry={() => void escalations.refetch()} /> : null}
          {escalations.data?.length === 0 ? <EmptyState title="No open escalations" /> : null}
          <ul className="flex flex-col gap-3">
            {escalations.data?.map((escalation) => (
              <li key={escalation.id} className="rounded-md border p-4">
                <div className="flex items-start justify-between gap-2"><p className="font-medium">{escalation.resource.title}</p><Badge variant="warning">OPEN</Badge></div>
                <p className="mt-2 text-sm text-muted-foreground">{escalation.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {escalation.reportId ? (
                    <>
                      <Button type="button" size="sm" onClick={() => void run(() => decide.mutateAsync({ id: escalation.id, decision: "RESOLVED" }))}>Resolve</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void run(() => decide.mutateAsync({ id: escalation.id, decision: "DISMISSED" }))}>Dismiss</Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" size="sm" onClick={() => void run(() => decide.mutateAsync({ id: escalation.id, decision: "APPROVED" }))}>Approve deletion</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => void run(() => decide.mutateAsync({ id: escalation.id, decision: "DENIED" }))}>Deny deletion</Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-2 border-t pt-4">
            <label className="text-sm font-medium" htmlFor="revoke-resource-id">Revoke PLATFORM publication</label>
            <div className="flex gap-2">
              <Input id="revoke-resource-id" value={revokeId} onChange={(event) => setRevokeId(event.target.value)} placeholder="Resource UUID" />
              <Button type="button" variant="outline" onClick={() => void revokeResource()} disabled={!revokeId}>Revoke</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {platformAdmin ? (
        <>
          <Card>
            <CardHeader><CardTitle className="text-lg">Platform override</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Input value={overrideId} onChange={(event) => setOverrideId(event.target.value)} placeholder="Resource UUID" />
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional replacement title" />
              <textarea
                rows={3}
                maxLength={1000}
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
                placeholder="Mandatory justification (10–1000 characters)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void submitOverride("update")}>Override update</Button>
                <Button type="button" variant="destructive" onClick={() => void submitOverride("delete")}>Soft delete</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-lg">Audit log</CardTitle></CardHeader>
            <CardContent>
              {auditLogs.isPending ? <LoadingState label="Loading audit logs…" /> : null}
              {auditLogs.isError ? <ErrorState title="Could not load audit logs" onRetry={() => void auditLogs.refetch()} /> : null}
              {auditLogs.data?.length === 0 ? <EmptyState title="No audit entries" /> : null}
              <ul className="flex flex-col gap-2">
                {auditLogs.data?.map((entry) => (
                  <li key={entry.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{entry.action}</p><Badge variant="outline">{entry.targetType}</Badge></div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.actor.name} · {new Date(entry.createdAt).toLocaleString()}</p>
                    {entry.justification ? <p className="mt-2 text-sm">{entry.justification}</p> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
