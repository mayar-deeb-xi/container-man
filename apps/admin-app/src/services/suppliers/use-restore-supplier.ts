"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Supplier } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { suppliersKey } from "./use-suppliers";

/** Answers 409 when a live supplier has taken the code while this one sat in the trash. */
export async function restoreSupplier(id: string): Promise<Supplier> {
  const { data } = await api.post<BaseResponse<Supplier>>(`/suppliers/${id}/restore`);
  return data.data;
}

export function useRestoreSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restoreSupplier,
    // The root prefix reaches the trash and the live list alike — a restore moves a row
    // from one to the other, so both are stale.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: suppliersKey }),
  });
}
