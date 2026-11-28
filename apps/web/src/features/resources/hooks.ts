"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchMyResources,
  deleteResourceAsCr,
  fetchResourceList,
  fetchResourceDetail,
  saveResourceSharing,
  updateResourceMetadata,
  uploadResource,
  uploadResourceVersion,
} from "./api";
import type { ResourceMetadataInput, ResourceUploadInput } from "./schemas";
import type {
  ResourceDetail,
  ResourceListItem,
  ResourceListFilters,
  ResourceListResult,
  ResourceState,
  ResourceUploadResult,
  ResourceVersionUploadResult,
} from "./types";
import type { SaveResourceSharingInput } from "./api";

export const resourceKeys = {
  all: ["resources"] as const,
  mine: ["resources", "mine"] as const,
  mineByState: (state?: ResourceState) => ["resources", "mine", state ?? "all"] as const,
  list: (filters: object) => ["resources", "list", filters] as const,
  detail: (id: string) => ["resources", "detail", id] as const,
};

export const useUploadResource = () => {
  const queryClient = useQueryClient();

  return useMutation<ResourceUploadResult, unknown, { input: ResourceUploadInput; file: File }>({
    mutationFn: ({ input, file }) => uploadResource(input, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.all });
      toast.success("Resource uploaded");
    },
  });
};

export const useMyResources = (state?: ResourceState) =>
  useQuery<ResourceListItem[]>({
    queryKey: resourceKeys.mineByState(state),
    queryFn: () => fetchMyResources(state),
  });

export const useResourceDetail = (id: string) =>
  useQuery<ResourceDetail>({
    queryKey: resourceKeys.detail(id),
    queryFn: ({ signal }) => fetchResourceDetail(id, signal),
    enabled: id.length > 0,
  });

export const useResourceList = (filters: ResourceListFilters, enabled = true) =>
  useQuery<ResourceListResult>({
    queryKey: resourceKeys.list(filters),
    queryFn: ({ signal }) => fetchResourceList(filters, signal),
    enabled,
    placeholderData: (previous) => previous,
  });

export const useUpdateResourceMetadata = () => {
  const queryClient = useQueryClient();

  return useMutation<ResourceDetail, unknown, { id: string; input: ResourceMetadataInput }>({
    mutationFn: ({ id, input }) => updateResourceMetadata(id, input),
    onSuccess: (resource) => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.mine });
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(resource.id) });
      toast.success("Resource details saved");
    },
  });
};

export const useUploadResourceVersion = () => {
  const queryClient = useQueryClient();

  return useMutation<ResourceVersionUploadResult, unknown, { id: string; file: File }>({
    mutationFn: ({ id, file }) => uploadResourceVersion(id, file),
    onSuccess: (version) => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.mine });
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(version.resourceId) });
      toast.success(version.state === "PENDING" ? "Revision sent for review" : "New version uploaded");
    },
  });
};

export const useSaveResourceSharing = () => {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, SaveResourceSharingInput>({
    mutationFn: saveResourceSharing,
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.all });
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(input.resourceId) });
      toast.success("Sharing settings saved");
    },
  });
};

export const useDeleteResourceAsCr = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteResourceAsCr,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: resourceKeys.all });
      toast.success("File deleted.");
    },
  });
};