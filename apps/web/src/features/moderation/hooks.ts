"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { approveResource, fetchModerationQueue, openResourceForReview, rejectResource } from "./api";
import type { ModerationQueueState } from "./types";

export const moderationKeys = {
  all: ["moderation"] as const,
  queue: (state: ModerationQueueState | "ALL", page: number) => ["moderation", "queue", state, page] as const,
};

export const useModerationQueue = (state: ModerationQueueState | "ALL", page: number) =>
  useQuery({
    queryKey: moderationKeys.queue(state, page),
    queryFn: ({ signal }) => fetchModerationQueue({ state: state === "ALL" ? undefined : state, page, pageSize: 20 }, signal),
    placeholderData: (previous) => previous,
  });

const useModerationAction = <TVariables,>(
  mutationFn: (variables: TVariables) => Promise<void>,
  successMessage: string,
) => {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, TVariables>({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: moderationKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["resources"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(successMessage);
    },
  });
};

export const useOpenResourceForReview = () =>
  useModerationAction((id: string) => openResourceForReview(id), "Review started");

export const useApproveResource = () =>
  useModerationAction((id: string) => approveResource(id), "Resource approved");

export const useRejectResource = () =>
  useModerationAction(({ id, reason }: { id: string; reason: string }) => rejectResource(id, reason), "Resource rejected");