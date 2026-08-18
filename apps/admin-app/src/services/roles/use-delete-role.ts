"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "~/lib/axios";
import { roleDetailKey } from "./use-role";
import { rolesKey } from "./use-roles";

export async function deleteRole(id: string): Promise<void> {
  await api.delete(`/roles/${id}`);
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRole,
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: roleDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: rolesKey });
    },
  });
}
