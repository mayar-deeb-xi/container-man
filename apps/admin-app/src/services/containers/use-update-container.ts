"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Container, UpdateContainerPayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { containerDetailKey } from "./use-container";
import { containersKey } from "./use-containers";

export async function updateContainer(
  id: string,
  payload: UpdateContainerPayload,
): Promise<Container> {
  const { data } = await api.patch<BaseResponse<Container>>(`/containers/${id}`, payload);
  return data.data;
}

export function useUpdateContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateContainerPayload }) =>
      updateContainer(id, payload),
    onSuccess: (container) => {
      queryClient.setQueryData(containerDetailKey(container.id), container);
      // A renumbered or restatused box moves between pages and filters, so the lists are
      // invalidated wholesale rather than patched in place.
      void queryClient.invalidateQueries({ queryKey: containersKey });
    },
  });
}
