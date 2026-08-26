"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Container } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { containersKey } from "./use-containers";

/**
 * Answers 409 when a live box has taken the number while this one sat in the trash — the
 * one way a restore can fail that the caller has to resolve by hand.
 */
export async function restoreContainer(id: string): Promise<Container> {
  const { data } = await api.post<BaseResponse<Container>>(`/containers/${id}/restore`);
  return data.data;
}

export function useRestoreContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreContainer,
    // The root prefix reaches the trash pages and the live lists alike — a restore moves a
    // row from one to the other, so both are stale.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: containersKey }),
  });
}
