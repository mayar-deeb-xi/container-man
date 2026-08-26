"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DeliveryFile, UploadFilePayload } from "./types";
import type { BaseResponse } from "~/lib/base-response";
import { api } from "~/lib/axios";
import { deliveriesKey } from "./use-deliveries";

/**
 * File transfer, both directions through the authenticated API — there is no public
 * URL to a stored file, by design. Uploads are multipart; downloads arrive as blobs
 * and become object URLs that live exactly as long as the component showing them.
 */

export async function uploadDeliveryFile(
  deliveryId: string,
  payload: UploadFilePayload,
): Promise<DeliveryFile> {
  const body = new FormData();
  body.append("file", payload.file, payload.fileName);
  if (payload.palletId) body.append("palletId", payload.palletId);
  if (payload.docType) body.append("docType", payload.docType);

  const { data } = await api.post<BaseResponse<DeliveryFile>>(
    `/deliveries/${deliveryId}/files`,
    body,
    // The instance default is JSON; multipart needs the boundary axios generates.
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data.data;
}

export function useUploadDeliveryFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deliveryId, payload }: { deliveryId: string; payload: UploadFilePayload }) =>
      uploadDeliveryFile(deliveryId, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: deliveriesKey }),
  });
}

export async function deleteDeliveryFile(deliveryId: string, fileId: string): Promise<void> {
  await api.delete(`/deliveries/${deliveryId}/files/${fileId}`);
}

export function useDeleteDeliveryFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ deliveryId, fileId }: { deliveryId: string; fileId: string }) =>
      deleteDeliveryFile(deliveryId, fileId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: deliveriesKey }),
  });
}

export const deliveryFileBlobKey = (deliveryId: string, fileId: string) =>
  [...deliveriesKey, "file-blob", deliveryId, fileId] as const;

export async function fetchDeliveryFileBlob(deliveryId: string, fileId: string): Promise<Blob> {
  const { data } = await api.get<Blob>(`/deliveries/${deliveryId}/files/${fileId}`, {
    responseType: "blob",
  });
  return data;
}

/**
 * A stored file as an object URL, for `<img>` and preview links.
 *
 * `staleTime: Infinity` is honest, not an optimization: a file never changes under its
 * id, so a blob once fetched is right forever. The object URL is created per consumer
 * and revoked on unmount — URLs, unlike the cached blob, cannot be shared safely
 * because whoever revokes first would break the others.
 */
export function useDeliveryFileUrl(
  deliveryId: string,
  fileId: string,
  enabled = true,
): { url: string | undefined; isPending: boolean; isError: boolean } {
  const { data: blob, isPending, isError } = useQuery({
    queryKey: deliveryFileBlobKey(deliveryId, fileId),
    queryFn: () => fetchDeliveryFileBlob(deliveryId, fileId),
    enabled,
    staleTime: Infinity,
  });

  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      setUrl(undefined);
      URL.revokeObjectURL(next);
    };
  }, [blob]);

  return { url, isPending, isError };
}

/**
 * Fetches a file and hands it to the browser as a download, under the record's
 * generated name (`GI-0091_P01_20260713.jpg`) — the one place the paper form's naming
 * convention survives, and it costs the user nothing.
 */
export async function saveDeliveryFile(deliveryId: string, file: DeliveryFile): Promise<void> {
  const blob = await fetchDeliveryFileBlob(deliveryId, file.id);
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.downloadName;
    anchor.click();
  } finally {
    // Revoked on the next tick: revoking synchronously races the click in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
