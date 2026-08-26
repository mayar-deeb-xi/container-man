"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreateSupplierPayload, Supplier } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { suppliersKey } from "./use-suppliers";

export async function createSupplier(payload: CreateSupplierPayload): Promise<Supplier> {
  const { data } = await api.post<BaseResponse<Supplier>>("/suppliers", payload);
  return data.data;
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSupplier,
    // The list is ordered by code, so a new supplier can land on any page.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: suppliersKey }),
  });
}
