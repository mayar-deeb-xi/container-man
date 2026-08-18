"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { AdminUser, CreateUserPayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { usersKey } from "./use-users";

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const { data } = await api.post<BaseResponse<AdminUser>>("/users", payload);
  return data.data;
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUser,
    // The whole `["users"]` subtree, not the current page: a new row can land on
    // any page, and reordering a list from the client is how caches drift out of
    // step with the server's ordering.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKey }),
  });
}
