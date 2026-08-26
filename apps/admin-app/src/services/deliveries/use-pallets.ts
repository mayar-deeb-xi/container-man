"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { CreatePalletPayload, Pallet, UpdatePalletPayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";

/**
 * Pallet writes, together in one file because they are one sub-resource: lines of a
 * draft delivery, always reached through it. Every success invalidates the whole
 * deliveries subtree — a pallet change moves the register row's aggregates too.
 */

export async function addPallet(deliveryId: string, payload: CreatePalletPayload): Promise<Pallet> {
  const { data } = await api.post<BaseResponse<Pallet>>(
    `/deliveries/${deliveryId}/pallets`,
    payload,
  );
  return data.data;
}

export function useAddPallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deliveryId, payload }: { deliveryId: string; payload: CreatePalletPayload }) =>
      addPallet(deliveryId, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: deliveriesKey }),
  });
}

export async function updatePallet(
  deliveryId: string,
  palletId: string,
  payload: UpdatePalletPayload,
): Promise<Pallet> {
  const { data } = await api.patch<BaseResponse<Pallet>>(
    `/deliveries/${deliveryId}/pallets/${palletId}`,
    payload,
  );
  return data.data;
}

export function useUpdatePallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      deliveryId,
      palletId,
      payload,
    }: {
      deliveryId: string;
      palletId: string;
      payload: UpdatePalletPayload;
    }) => updatePallet(deliveryId, palletId, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: deliveriesKey }),
  });
}

/** A hard delete — a line struck from an unfinished form. Its photos go with it. */
export async function removePallet(deliveryId: string, palletId: string): Promise<void> {
  await api.delete(`/deliveries/${deliveryId}/pallets/${palletId}`);
}

export function useRemovePallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deliveryId, palletId }: { deliveryId: string; palletId: string }) =>
      removePallet(deliveryId, palletId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: deliveriesKey }),
  });
}
