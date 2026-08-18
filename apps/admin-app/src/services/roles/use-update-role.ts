"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RoleDetail, UpdateRolePayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { sessionKey } from "../auth/use-session";
import { usersKey } from "../users/use-users";
import { roleDetailKey } from "./use-role";
import { rolesKey } from "./use-roles";

export async function updateRole(id: string, payload: UpdateRolePayload): Promise<RoleDetail> {
  const { data } = await api.patch<BaseResponse<RoleDetail>>(`/roles/${id}`, payload);
  return data.data;
}

export function useUpdateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateRolePayload }) =>
      updateRole(id, payload),
    onSuccess: (role) => {
      queryClient.setQueryData(roleDetailKey(role.id), role);
      void queryClient.invalidateQueries({ queryKey: rolesKey });
      // A renamed role is a renamed chip on every user who holds it, and a renamed row
      // in the sidebar's own account menu — neither reads the roles cache.
      void queryClient.invalidateQueries({ queryKey: usersKey });
      void queryClient.invalidateQueries({ queryKey: sessionKey });
    },
  });
}
