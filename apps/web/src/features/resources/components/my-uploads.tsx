"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
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
import {
  useMyResources,
  useResourceDetail,
  useUpdateResourceMetadata,
  useUploadResourceVersion,
} from "../hooks";
import { resourceMetadataSchema, type ResourceMetadataInput } from "../schemas";
import type { ResourceState, ResourceVersionState } from "../types";

const VERSION_FILE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg";
const STATUS_OPTIONS: { value: ResourceState | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DELETED", label: "Deleted" },
];

const statusVariant = (state: ResourceState | ResourceVersionState) => {
  if (state === "APPROVED") return "success" as const;
  if (state === "REJECTED" || state === "DELETED") return "destructive" as const;
  if (state === "PENDING") return "warning" as const;
  return "secondary" as const;
};

export function MyUploads() {
  const [status, setStatus] = useState<ResourceState | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState("");
  const resources = useMyResources(status === "ALL" ? undefined : status);
  const selected = useResourceDetail(selectedId);
  const updateMetadata = useUpdateResourceMetadata();
  const uploadVersion = useUploadResourceVersion();
  const versionInput = useRef<HTMLInputElement>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);

  useEffect(() => {
    const rows = resources.data ?? [];
    if (rows.length === 0) {
      setSelectedId("");
    } else if (!rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? "");
    }
  }, [resources.data, selectedId]);

  const metadataForm = useForm<ResourceMetadataInput>({
    resolver: zodResolver(resourceMetadataSchema),
    defaultValues: { title: "", description: "", tags: "", resourceType: "NOTES" },
  });
  const resetMetadataForm = metadataForm.reset;

  useEffect(() => {
    if (!selected.data) return;
    resetMetadataForm({
      title: selected.data.title,
      description: selected.data.description ?? "",
      tags: selected.data.tags.join(", "),
      resourceType: selected.data.resourceType,
    });
  }, [selected.data?.id, selected.data?.updatedAt, resetMetadataForm]);

  const saveMetadata = metadataForm.handleSubmit(async (input) => {
    if (!selectedId) return;
    try {
      await updateMetadata.mutateAsync({ id: selectedId, input });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save resource details");
    }
  });

  const submitVersion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || !versionFile) {
      toast.error("Choose a file for the new version");
      return;
    }

    try {
      await uploadVersion.mutateAsync({ id: selectedId, file: versionFile });
      setVersionFile(null);
      if (versionInput.current) versionInput.current.value = "";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the new version");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My uploads" description="Track review status and update the resources you own." />

      <div className="flex justify-end">
        <div className="w-full sm:w-56">
          <Select
            aria-label="Filter uploads by status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ResourceState | "ALL")}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {resources.isPending ? <LoadingState label="Loading your uploads…" /> : null}
      {resources.isError ? (
        <ErrorState
          title="Could not load your uploads"
          description={resources.error instanceof Error ? resources.error.message : undefined}
          onRetry={() => void resources.refetch()}
        />
      ) : null}
      {resources.data?.length === 0 ? <EmptyState title="No uploads in this status" /> : null}

      {resources.data && resources.data.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.6fr)]">
          <section aria-label="Your resources" className="flex flex-col gap-2">
            {resources.data.map((resource) => (
              <button
                key={resource.id}
                type="button"
                aria-pressed={selectedId === resource.id}
                onClick={() => setSelectedId(resource.id)}
                className={`rounded-md border p-4 text-left transition-colors hover:bg-accent ${selectedId === resource.id ? "border-foreground bg-accent" : "bg-card"}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{resource.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {resource.course.name} · {resource.department.name}
                    </span>
                  </span>
                  <Badge variant={statusVariant(resource.state)}>{resource.state.replaceAll("_", " ")}</Badge>
                </span>
                {resource.latestVersionState && resource.latestVersionState !== resource.state ? (
                  <span className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(resource.latestVersionState)}>
                      Latest version: {resource.latestVersionState.replaceAll("_", " ")}
                    </Badge>
                  </span>
                ) : null}
                {resource.rejectionReason ? (
                  <span className="mt-2 block text-xs text-destructive">{resource.rejectionReason}</span>
                ) : null}
              </button>
            ))}
          </section>

          <section aria-label="Selected resource details">
            {selected.isPending ? <LoadingState label="Loading resource details…" /> : null}
            {selected.isError ? (
              <ErrorState
                title="Could not load resource details"
                description={selected.error instanceof Error ? selected.error.message : undefined}
                onRetry={() => void selected.refetch()}
              />
            ) : null}
            {selected.data ? (
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Version history</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="flex flex-col divide-y">
                      {selected.data.versions.map((version) => (
                        <li key={version.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                          <span className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium">Version {version.versionNo}</span>
                            <Badge variant={statusVariant(version.state)}>{version.state.replaceAll("_", " ")}</Badge>
                            {selected.data.currentVersionId === version.id ? <Badge variant="outline">Current</Badge> : null}
                          </span>
                          <span className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</span>
                          {version.rejectionReason ? (
                            <p className="basis-full text-sm text-destructive">{version.rejectionReason}</p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Edit details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveMetadata} noValidate>
                      <FormField id="upload-title" label="Title" error={metadataForm.formState.errors.title?.message}>
                        <Input id="upload-title" {...metadataForm.register("title")} />
                      </FormField>
                      <FormField id="upload-type" label="Resource type" error={metadataForm.formState.errors.resourceType?.message}>
                        <Select id="upload-type" {...metadataForm.register("resourceType")}>
                          <option value="NOTES">Notes</option>
                          <option value="SLIDES">Slides</option>
                          <option value="ASSIGNMENT">Assignment</option>
                          <option value="QUESTION_BANK">Question bank</option>
                          <option value="BOOK">Book</option>
                          <option value="OTHER">Other</option>
                        </Select>
                      </FormField>
                      <div className="sm:col-span-2">
                        <FormField id="upload-description" label="Description" error={metadataForm.formState.errors.description?.message}>
                          <textarea
                            id="upload-description"
                            rows={3}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            {...metadataForm.register("description")}
                          />
                        </FormField>
                      </div>
                      <div className="sm:col-span-2">
                        <FormField id="upload-tags" label="Tags" hint="Comma-separated" error={metadataForm.formState.errors.tags?.message}>
                          <Input id="upload-tags" {...metadataForm.register("tags")} />
                        </FormField>
                      </div>
                      <div className="sm:col-span-2 flex justify-end">
                        <Button type="submit" disabled={updateMetadata.isPending || metadataForm.formState.isSubmitting}>
                          {updateMetadata.isPending ? "Saving…" : "Save details"}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Upload a new version</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={submitVersion}>
                      <FormField id="version-file" label="Replacement file" hint="The current approved version stays available until review completes.">
                        <Input
                          ref={versionInput}
                          id="version-file"
                          type="file"
                          accept={VERSION_FILE_ACCEPT}
                          onChange={(event) => setVersionFile(event.currentTarget.files?.[0] ?? null)}
                        />
                      </FormField>
                      <Button type="submit" disabled={!versionFile || uploadVersion.isPending}>
                        {uploadVersion.isPending ? "Uploading…" : "Upload version"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}