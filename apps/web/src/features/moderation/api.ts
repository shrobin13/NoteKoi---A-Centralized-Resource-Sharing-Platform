import { apiPost, apiRequest, toQueryString } from "@/lib/api";
import type { ModerationQueueResult, ModerationQueueState } from "./types";

export const fetchModerationQueue = async (
  params: { state?: ModerationQueueState; page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<ModerationQueueResult> => {
  const response = await apiRequest<ModerationQueueResult["items"]>(`/moderation/queue${toQueryString(params)}`, {
    signal,
  });
  const numberMeta = (key: string, fallback: number): number =>
    typeof response.meta[key] === "number" ? (response.meta[key] as number) : fallback;

  return {
    items: response.data,
    page: numberMeta("page", params.page),
    pageSize: numberMeta("pageSize", params.pageSize),
    total: numberMeta("total", response.data.length),
    totalPages: numberMeta("totalPages", response.data.length > 0 ? 1 : 0),
  };
};

export const openResourceForReview = async (id: string): Promise<void> => {
  await apiPost(`/moderation/resources/${id}/open`, {});
};

export const approveResource = async (id: string): Promise<void> => {
  await apiPost(`/moderation/resources/${id}/approve`, {});
};

export const rejectResource = async (id: string, reason: string): Promise<void> => {
  await apiPost(`/moderation/resources/${id}/reject`, { reason });
};