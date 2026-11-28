import { env } from "@/lib/env";
import { apiDelete, apiGet, apiPatch, apiPost, apiRequest, ApiError, toQueryString } from "@/lib/api";
import type { PublishAudience, ResourceMetadataInput, ResourceUploadInput } from "./schemas";
import type {
  ResourceDetail,
  ResourceAudience,
  ResourceListItem,
  ResourceListFilters,
  ResourceListResult,
  ResourceState,
  ResourceUploadResult,
  ResourceVersionUploadResult,
  UploadTokenResult,
} from "./types";

const PROXY_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

const sendFileForm = async <T>(path: string, form: FormData, file: File): Promise<T> => {
  if (env.uploadApiBaseUrl) {
    const { data: uploadToken } = await apiPost<UploadTokenResult>("/auth/upload-token", {});
    const response = await apiRequest<T>(path, {
      method: "POST",
      baseUrl: env.uploadApiBaseUrl,
      credentials: "omit",
      headers: { Authorization: `Bearer ${uploadToken.token}` },
      body: form,
    });

    return response.data;
  }

  if (file.size > PROXY_BODY_LIMIT_BYTES) {
    throw new ApiError(
      0,
      "This file is too large for the web proxy. Configure NEXT_PUBLIC_UPLOAD_API_URL for direct uploads.",
      "DIRECT_UPLOAD_URL_REQUIRED",
    );
  }

  return (await apiRequest<T>(path, { method: "POST", body: form })).data;
};

export const uploadResource = async (input: ResourceUploadInput, file: File): Promise<ResourceUploadResult> => {
  const form = new FormData();
  form.set("title", input.title);
  form.set("resourceType", input.resourceType);
  form.set("courseId", input.courseId);
  if (input.semesterCourseId) form.set("semesterCourseId", input.semesterCourseId);
  if (input.categoryId) form.set("categoryId", input.categoryId);
  form.set("audience", input.audience);
  if (input.description) form.set("description", input.description);
  if (input.tags) form.set("tags", input.tags);
  form.set("file", file);

  return sendFileForm<ResourceUploadResult>("/resources", form, file);
};

export const fetchMyResources = (state?: ResourceState): Promise<ResourceListItem[]> =>
  apiGet<ResourceListItem[]>(`/resources/mine${toQueryString({ state, pageSize: 50 })}`);

export const deleteResourceAsCr = (id: string): Promise<ResourceDetail> => apiDelete<ResourceDetail>(`/resources/${id}`);

export const fetchResourceList = async (
  filters: ResourceListFilters,
  signal?: AbortSignal,
): Promise<ResourceListResult> => {
  const response = await apiRequest<ResourceListItem[]>(`/resources${toQueryString(filters)}`, { signal });
  const metaNumber = (key: string, fallback: number): number =>
    typeof response.meta[key] === "number" ? (response.meta[key] as number) : fallback;

  return {
    items: response.data,
    page: metaNumber("page", filters.page),
    pageSize: metaNumber("pageSize", filters.pageSize),
    total: metaNumber("total", response.data.length),
    totalPages: metaNumber("totalPages", response.data.length > 0 ? 1 : 0),
  };
};

export const fetchResourceDetail = (id: string, signal?: AbortSignal): Promise<ResourceDetail> =>
  apiGet<ResourceDetail>(`/resources/${id}`, signal);

export const updateResourceMetadata = (id: string, input: ResourceMetadataInput): Promise<ResourceDetail> =>
  apiPatch<ResourceDetail>(`/resources/${id}`, input);

export const uploadResourceVersion = (id: string, file: File): Promise<ResourceVersionUploadResult> => {
  const form = new FormData();
  form.set("file", file);

  return sendFileForm<ResourceVersionUploadResult>(`/resources/${id}/versions`, form, file);
};

export interface SaveResourceSharingInput {
  resourceId: string;
  currentAudience: ResourceAudience;
  targetAudience: PublishAudience;
  existingSessionIds: string[];
  selectedSessionIds: string[];
}

export const publishResource = async (
  id: string,
  audience: Exclude<PublishAudience, "PRIVATE">,
  sessionIds?: string[],
): Promise<ResourceDetail> =>
  (await apiPost<ResourceDetail>(`/resources/${id}/publish`, { audience, ...(sessionIds ? { sessionIds } : {}) })).data;

export const changeResourceVisibility = async (
  id: string,
  audience: "COLLEGE" | "PLATFORM",
): Promise<ResourceDetail> => apiPatch<ResourceDetail>(`/resources/${id}/visibility`, { audience });

export const addResourceGrants = async (id: string, sessionIds: string[]): Promise<ResourceDetail> =>
  (await apiPost<ResourceDetail>(`/resources/${id}/grants`, { sessionIds })).data;

export const revokeResourceGrant = (id: string, sessionId: string): Promise<ResourceDetail> =>
  apiDelete<ResourceDetail>(`/resources/${id}/grants/${sessionId}`);

export const saveResourceSharing = async (input: SaveResourceSharingInput): Promise<void> => {
  const existing = new Set(input.existingSessionIds);
  const selected = [...new Set(input.selectedSessionIds)];

  if (input.currentAudience === "PLATFORM") {
    throw new ApiError(400, "Platform-published resources cannot be changed in this view", "PUBLISH_NOT_AVAILABLE");
  }

  if (input.targetAudience === "PRIVATE") {
    if (input.currentAudience === "PERMITTED") {
      for (const sessionId of existing) await revokeResourceGrant(input.resourceId, sessionId);
    }
    return;
  }

  if (input.targetAudience === "PLATFORM") {
    if (input.currentAudience === "PERMITTED") {
      for (const sessionId of existing) await revokeResourceGrant(input.resourceId, sessionId);
    }
    await publishResource(input.resourceId, "PLATFORM");
    return;
  }

  if (selected.length === 0) {
    throw new ApiError(400, "Select at least one session for PERMITTED sharing", "SESSIONS_REQUIRED");
  }

  if (input.currentAudience === "PRIVATE") {
    await publishResource(input.resourceId, "PERMITTED", selected);
    return;
  }

  const additions = selected.filter((sessionId) => !existing.has(sessionId));
  const removals = [...existing].filter((sessionId) => !selected.includes(sessionId));
  if (additions.length > 0) await addResourceGrants(input.resourceId, additions);
  for (const sessionId of removals) await revokeResourceGrant(input.resourceId, sessionId);
};