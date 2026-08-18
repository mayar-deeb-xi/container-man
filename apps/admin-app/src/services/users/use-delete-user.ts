"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "~/lib/axios";
import { userDetailKey } from "./use-user";
import { usersKey } from "./use-users";

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUser,
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: userDetailKey(id) });
      void queryClient.invalidateQueries({ queryKey: usersKey });
    },
  });
}
