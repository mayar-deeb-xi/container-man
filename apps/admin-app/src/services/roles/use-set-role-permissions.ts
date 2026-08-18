"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RoleDetail, RulePayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { sessionKey } from "../auth/use-session";
import { roleDetailKey } from "./use-role";
import { rolesKey } from "./use-roles";

export async function setRolePermissions(id: string, rules: RulePayload[]): Promise<RoleDetail> {
  // PUT, and the whole set: the matrix knows every cell's state, so a merge would need
  // a second "revoke" call that could be lost while the checkbox looked unchecked.
  const { data } = await api.put<BaseResponse<RoleDetail>>(`/roles/${id}/permissions`, { rules });
  return data.data;
}

export function useSetRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, rules }: { id: string; rules: RulePayload[] }) =>
      setRolePermissions(id, rules),
    onSuccess: (role) => {
      queryClient.setQueryData(roleDetailKey(role.id), role);
      // `permissionCount` on the list row moved.
      void queryClient.invalidateQueries({ queryKey: rolesKey });
      // The editor may have just changed what the *editor* may do — the session query is
      // what feeds every `<Can>` in the tree, so it has to be re-read rather than left
      // showing controls the API will now refuse.
      void queryClient.invalidateQueries({ queryKey: sessionKey });
    },
  });
}
