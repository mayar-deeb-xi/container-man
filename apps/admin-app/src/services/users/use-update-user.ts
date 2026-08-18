"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { UpdateUserPayload, User } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { sessionKey } from "../auth/use-session";
import { userDetailKey } from "./use-user";
import { usersKey } from "./use-users";

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<User> {
  const { data } = await api.patch<BaseResponse<User>>(`/users/${id}`, payload);
  return data.data;
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
      updateUser(id, payload),
    onSuccess: (user) => {
      queryClient.setQueryData(userDetailKey(user.id), user);
      // A rename can move the row between pages, so the lists are invalidated
      // wholesale rather than patched in place.
      void queryClient.invalidateQueries({ queryKey: usersKey });
      // Editing yourself — a rename, a new email — changes what the sidebar and
      // the account card show, and those read the session query, not this one.
      void queryClient.invalidateQueries({ queryKey: sessionKey });
    },
  });
}
