"use client";

import { Folder, FolderOpen, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useMe } from "@/features/auth/hooks/use-auth";
import { useCourseList } from "@/features/academic/hooks";
import { getErrorMessage } from "@/lib/api";
import { ResourceSharingManager } from "@/features/resources/components/resource-sharing-manager";
import { useCreateFolder, useDeleteFolder, useFolderTree, useUpdateFolder } from "../hooks";
import { folderNameSchema } from "../schemas";
import type { FolderTreeItem } from "../types";

const flattenFolders = (folders: FolderTreeItem[]): FolderTreeItem[] =>
  folders.flatMap((folder) => [folder, ...flattenFolders(folder.children)]);

const collectDescendants = (folder: FolderTreeItem): Set<string> => {
  const descendants = new Set<string>();
  const visit = (node: FolderTreeItem) => {
    for (const child of node.children) {
      descendants.add(child.id);
      visit(child);
    }
  };
  visit(folder);
  return descendants;
};

export function MyFiles() {
  const me = useMe();
  const profile = me.data?.profile;
  const isTeacher = profile?.kind === "teacher";
  const canManage = Boolean(isTeacher && profile.verificationStatus === "ACTIVE");
  const courses = useCourseList({ status: "active" }, canManage);
  const availableCourses = useMemo(
    () => courses.data?.filter((course) => isTeacher && profile.departments.some((department) => department.id === course.departmentId)) ?? [],
    [courses.data, isTeacher, profile],
  );
  const folders = useFolderTree(undefined, canManage);
  const create = useCreateFolder();
  const update = useUpdateFolder();
  const remove = useDeleteFolder();
  const [selectedId, setSelectedId] = useState("");
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [newCourseId, setNewCourseId] = useState("");
  const [editName, setEditName] = useState("");
  const [moveParentId, setMoveParentId] = useState("");

  const flatFolders = useMemo(() => flattenFolders(folders.data ?? []), [folders.data]);
  const selectedFolder = flatFolders.find((folder) => folder.id === selectedId);
  const descendants = selectedFolder ? collectDescendants(selectedFolder) : new Set<string>();
  const moveTargets = flatFolders.filter(
    (folder) => folder.id !== selectedId && !descendants.has(folder.id) && folder.courseId === selectedFolder?.courseId,
  );

  useEffect(() => {
    if (!folders.data) return;
    const allFolders = flattenFolders(folders.data);
    if (allFolders.length === 0) setSelectedId("");
    else if (!allFolders.some((folder) => folder.id === selectedId)) setSelectedId(allFolders[0]?.id ?? "");
  }, [folders.data, selectedId]);

  useEffect(() => {
    if (!selectedFolder) return;
    setEditName(selectedFolder.name);
    setMoveParentId(selectedFolder.parentId ?? "");
  }, [selectedFolder?.id, selectedFolder?.name, selectedFolder?.parentId]);

  if (!me.data) return null;

  if (!isTeacher) {
    return (
      <Alert variant="warning">
        <AlertTitle>Teacher file workspace</AlertTitle>
        <AlertDescription>Folder organization is available to verified teacher accounts.</AlertDescription>
      </Alert>
    );
  }

  if (!canManage) {
    return (
      <Alert variant="warning">
        <AlertTitle>Verification required</AlertTitle>
        <AlertDescription>Your teacher profile must be verified before you can manage folders.</AlertDescription>
      </Alert>
    );
  }

  const createFolder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedName = folderNameSchema.safeParse(newName);
    if (!parsedName.success) {
      toast.error(parsedName.error.issues[0]?.message ?? "Enter a valid folder name");
      return;
    }

    try {
      const created = await create.mutateAsync({
        name: parsedName.data,
        ...(newParentId ? { parentId: newParentId } : {}),
        ...(!newParentId && newCourseId ? { courseId: newCourseId } : {}),
      });
      setNewName("");
      setSelectedId(created.id);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const saveFolder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFolder) return;
    const parsedName = folderNameSchema.safeParse(editName);
    if (!parsedName.success) {
      toast.error(parsedName.error.issues[0]?.message ?? "Enter a valid folder name");
      return;
    }

    const parentId = moveParentId || null;
    const input = {
      ...(parsedName.data !== selectedFolder.name ? { name: parsedName.data } : {}),
      ...(parentId !== selectedFolder.parentId ? { parentId } : {}),
    };
    if (Object.keys(input).length === 0) {
      toast.message("No folder changes to save");
      return;
    }

    try {
      await update.mutateAsync({ id: selectedFolder.id, input });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const deleteSelectedFolder = async () => {
    if (!selectedFolder) return;
    try {
      await remove.mutateAsync(selectedFolder.id);
      setSelectedId("");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My files" description="Organize course materials in your private folder tree." />

      {courses.isError ? (
        <ErrorState
          title="Could not load your courses"
          description={courses.error instanceof Error ? courses.error.message : undefined}
          onRetry={() => void courses.refetch()}
        />
      ) : null}
      {folders.isPending ? <LoadingState label="Loading folders…" /> : null}
      {folders.isError ? (
        <ErrorState
          title="Could not load folders"
          description={folders.error instanceof Error ? folders.error.message : undefined}
          onRetry={() => void folders.refetch()}
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(17rem,0.9fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader><CardTitle className="text-lg">Folder tree</CardTitle></CardHeader>
          <CardContent>
            {folders.data?.length === 0 ? <EmptyState title="No folders yet" description="Create a root folder or organize it under a course." /> : null}
            {folders.data && folders.data.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {folders.data.map((folder) => (
                  <FolderNode key={folder.id} folder={folder} selectedId={selectedId} onSelect={setSelectedId} />
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader><CardTitle className="text-lg">Create folder</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={createFolder}>
                <FormField id="new-folder-name" label="Name">
                  <Input id="new-folder-name" value={newName} onChange={(event) => setNewName(event.target.value)} required maxLength={120} />
                </FormField>
                <FormField id="new-folder-parent" label="Parent folder">
                  <Select id="new-folder-parent" value={newParentId} onChange={(event) => setNewParentId(event.target.value)}>
                    <option value="">Root</option>
                    {flatFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>{"— ".repeat(folder.depth)}{folder.name}</option>
                    ))}
                  </Select>
                </FormField>
                {!newParentId ? (
                  <div className="sm:col-span-2">
                    <FormField id="new-folder-course" label="Course" hint="Optional">
                      <Select id="new-folder-course" value={newCourseId} onChange={(event) => setNewCourseId(event.target.value)}>
                        <option value="">Personal folder</option>
                        {availableCourses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                      </Select>
                    </FormField>
                  </div>
                ) : null}
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create folder"}</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {selectedFolder ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Folder settings</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedFolder.courseId ? "Course folder" : "Personal folder"} · depth {selectedFolder.depth}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Delete empty folder"
                  title={selectedFolder.childCount || selectedFolder.resourceCount ? "Move out contents before deleting" : "Delete folder"}
                  disabled={Boolean(selectedFolder.childCount || selectedFolder.resourceCount) || remove.isPending}
                  onClick={() => void deleteSelectedFolder()}
                >
                  <Trash2 aria-hidden />
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">{selectedFolder.childCount} subfolders</Badge>
                  <Badge variant="outline">{selectedFolder.resourceCount} resources</Badge>
                </div>
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveFolder}>
                  <FormField id="edit-folder-name" label="Name">
                    <Input id="edit-folder-name" value={editName} onChange={(event) => setEditName(event.target.value)} required maxLength={120} />
                  </FormField>
                  <FormField id="move-folder-parent" label="Move to">
                    <Select id="move-folder-parent" value={moveParentId} onChange={(event) => setMoveParentId(event.target.value)}>
                      <option value="">Root</option>
                      {moveTargets.map((folder) => (
                        <option key={folder.id} value={folder.id}>{"— ".repeat(folder.depth)}{folder.name}</option>
                      ))}
                    </Select>
                  </FormField>
                  <div className="sm:col-span-2 flex justify-end">
                    <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save folder"}</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      <ResourceSharingManager />
    </div>
  );
}

function FolderNode({
  folder,
  selectedId,
  onSelect,
}: {
  folder: FolderTreeItem;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const isSelected = folder.id === selectedId;

  return (
    <li>
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(folder.id)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${isSelected ? "bg-accent font-medium" : ""}`}
        style={{ paddingLeft: `${8 + folder.depth * 14}px` }}
      >
        {isSelected ? <FolderOpen className="size-4 shrink-0" aria-hidden /> : <Folder className="size-4 shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        <span className="text-xs text-muted-foreground">{folder.resourceCount}</span>
      </button>
      {folder.children.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {folder.children.map((child) => <FolderNode key={child.id} folder={child} selectedId={selectedId} onSelect={onSelect} />)}
        </ul>
      ) : null}
    </li>
  );
}