"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Container, CreateContainerPayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { containersKey } from "./use-containers";

export async function createContainer(payload: CreateContainerPayload): Promise<Container> {
  const { data } = await api.post<BaseResponse<Container>>("/containers", payload);
  return data.data;
}

export function useCreateContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createContainer,
    // The whole `["containers"]` subtree, not the current page: the list is ordered by
    // container number, so a new box can land on any page.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: containersKey }),
  });
}
