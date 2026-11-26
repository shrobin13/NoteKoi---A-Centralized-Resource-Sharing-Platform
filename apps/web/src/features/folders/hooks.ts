"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createFolder, deleteFolder, fetchFolderTree, updateFolder } from "./api";
import type { CreateFolderInput, UpdateFolderInput } from "./types";

export const folderKeys = {
  all: ["folders"] as const,
  tree: (courseId?: string) => ["folders", "tree", courseId ?? "all"] as const,
};

export const useFolderTree = (courseId?: string, enabled = true) =>
  useQuery({
    queryKey: folderKeys.tree(courseId),
    queryFn: ({ signal }) => fetchFolderTree(courseId, signal),
    enabled,
  });

const useFolderMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  successMessage: string,
) => {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      toast.success(successMessage);
    },
  });
};

export const useCreateFolder = () =>
  useFolderMutation((input: CreateFolderInput) => createFolder(input), "Folder created");

export const useUpdateFolder = () =>
  useFolderMutation(({ id, input }: { id: string; input: UpdateFolderInput }) => updateFolder(id, input), "Folder updated");

export const useDeleteFolder = () =>
  useFolderMutation((id: string) => deleteFolder(id), "Folder deleted");