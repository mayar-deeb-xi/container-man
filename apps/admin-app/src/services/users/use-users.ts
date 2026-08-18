"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { User, UsersPage, UsersQueryFilters } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";

/**
 * Root of the users cache, and a prefix of every other users key — which is what
 * lets a mutation invalidate the list, the filtered pages and the detail entries
 * in one call.
 */
export const usersKey = ["users"] as const;

/** The filters are part of the key, so each page and each search term is its own entry. */
export const usersListKey = (filters: UsersQueryFilters) => [...usersKey, "list", filters] as const;

export async function listUsers(filters: UsersQueryFilters): Promise<UsersPage> {
  const { data } = await api.get<BaseResponse<User[]>>("/users", {
    // axios drops `undefined` params, so an unset filter never reaches the query
    // string — which matters because the backend rejects `roleKey=""`.
    params: filters,
  });

  return {
    users: data.data,
    pagination: data.pagination ?? { skip: filters.skip, take: filters.take, total: 0 },
  };
}

export function useUsers(filters: UsersQueryFilters): UseQueryResult<UsersPage, unknown> {
  return useQuery({
    queryKey: usersListKey(filters),
    queryFn: () => listUsers(filters),
    // Paging and typing in the search box both change the key. Without this the
    // table would empty out and remount on every keystroke; with it the previous
    // page stays on screen, greyed by `isPlaceholderData`, until the next arrives.
    placeholderData: keepPreviousData,
  });
}
