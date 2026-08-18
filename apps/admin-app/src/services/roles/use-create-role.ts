"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreateRolePayload, RoleDetail } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { rolesKey } from "./use-roles";

export async function createRole(payload: CreateRolePayload): Promise<RoleDetail> {
  const { data } = await api.post<BaseResponse<RoleDetail>>("/roles", payload);
  return data.data;
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRole,
    // The whole `["roles"]` subtree: a new role can land on any page, and reordering a
    // list from the client is how caches drift out of step with the server's ordering.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rolesKey }),
  });
}
