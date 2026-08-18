"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";

import type { Container } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { containersKey } from "./use-containers";

/** Built from `containersKey` rather than restating it, so the prefix stays one string. */
export const containerDetailKey = (id: string) => [...containersKey, "detail", id] as const;

export async function getContainer(id: string): Promise<Container> {
  const { data } = await api.get<BaseResponse<Container>>(`/containers/${id}`);
  return data.data;
}

export function useContainer(id: string): UseQueryResult<Container, unknown> {
  return useQuery({
    queryKey: containerDetailKey(id),
    queryFn: () => getContainer(id),
    enabled: Boolean(id),
  });
}
