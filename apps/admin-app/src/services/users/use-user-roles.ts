"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BaseResponse } from "~/lib/base-response";
import type { SessionRole } from "~/services/auth/types";
import { api } from "~/lib/axios";
import { sessionKey } from "../auth/use-session";
import { rolesKey } from "../roles/use-roles";
import { userDetailKey } from "./use-user";
import { userRulesKey } from "./use-user-rules";
import { usersKey } from "./use-users";

export const userRolesKey = (id: string) => [...usersKey, "roles", id] as const;

export async function getUserRoles(id: string): Promise<SessionRole[]> {
  const { data } = await api.get<BaseResponse<SessionRole[]>>(`/users/${id}/roles`);
  return data.data;
}

export async function setUserRoles(id: string, roleIds: string[]): Promise<SessionRole[]> {
  // PUT with the complete set, like the role matrix: the editor knows every checkbox,
  // and "the list I sent is now the list" is the only reading that cannot half-apply.
  const { data } = await api.put<BaseResponse<SessionRole[]>>(`/users/${id}/roles`, { roleIds });
  return data.data;
}

export function useUserRoles(id: string): UseQueryResult<SessionRole[], unknown> {
  return useQuery({
    queryKey: userRolesKey(id),
    queryFn: () => getUserRoles(id),
    enabled: Boolean(id),
  });
}

export function useSetUserRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, roleIds }: { id: string; roleIds: string[] }) => setUserRoles(id, roleIds),
    onSuccess: (assigned, { id }) => {
      queryClient.setQueryData(userRolesKey(id), assigned);
      // The effective rules are derived from these, so the panel beside the editor is
      // stale the moment this lands.
      void queryClient.invalidateQueries({ queryKey: userRulesKey(id) });
      void queryClient.invalidateQueries({ queryKey: userDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: usersKey });
      // `userCount` on every roles list row just moved.
      void queryClient.invalidateQueries({ queryKey: rolesKey });
      // Not the actor's own roles — the API refuses that — but a role could have been
      // granted to someone whose session this browser also holds. Cheap, and wrong in
      // one direction only.
      void queryClient.invalidateQueries({ queryKey: sessionKey });
    },
  });
}
