"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "~/lib/axios";
import { containerDetailKey } from "./use-container";
import { containersKey } from "./use-containers";

export async function deleteContainer(id: string): Promise<void> {
  await api.delete(`/containers/${id}`);
}

export function useDeleteContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteContainer,
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: containerDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: containersKey });
    },
  });
}
