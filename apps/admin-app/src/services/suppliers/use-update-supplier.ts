"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Supplier, UpdateSupplierPayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { suppliersKey } from "./use-suppliers";

export async function updateSupplier(
  id: string,
  payload: UpdateSupplierPayload,
): Promise<Supplier> {
  const { data } = await api.patch<BaseResponse<Supplier>>(`/suppliers/${id}`, payload);
  return data.data;
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateSupplierPayload }) =>
      updateSupplier(id, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: suppliersKey }),
  });
}
