import type { GoodsDocType, PackingType, UploadMimeType } from "./vocabulary";
import { SPECIAL_PACKING, STANDARD_TARE_KG, UPLOAD_MIME_TYPES } from "./vocabulary";

/**
 * The arithmetic and the display formats of a goods-in record, defined once.
 *
 * The paper form this feature replaces asked staff to *compute* the net weight and to
 * *compose* identifiers by convention (`WE-YYMMDD-SupplierNo-DeliveryNo`). Neither
 * survives here: the net weight is derived from the two stored weights the same way a
 * container's payload is, and the human-facing reference is formatting over a
 * database-assigned number rather than a smart key — the date and the supplier are
 * columns, so correcting either never breaks an identifier.
 */

/** Net weight: what remains of the gross once the packaging is accounted for. */
export function netWeightKg(grossWeightKg: number, tareKg: number): number {
  return grossWeightKg - tareKg;
}

/** The standard tare for a packing, or `null` for the one that is weighed individually. */
export function standardTareKg(packing: PackingType): number | null {
  return STANDARD_TARE_KG[packing];
}

export function isSpecialPacking(packing: PackingType): boolean {
  return packing === SPECIAL_PACKING;
}

/** "GI" for goods in — the register these numbers belong to, not data about the delivery. */
export const DELIVERY_REFERENCE_PREFIX = "GI-";

/**
 * `GI-0091` — the reference a human quotes, derived from the sequential delivery number.
 *
 * Derived, never stored: the number is the identity and the reference is a rendering of
 * it. Padded to four digits so a register sorts the same alphabetically as numerically,
 * but not truncated beyond that — delivery 12345 is `GI-12345`.
 */
export function formatDeliveryReference(deliveryNo: number): string {
  return `${DELIVERY_REFERENCE_PREFIX}${String(deliveryNo).padStart(4, "0")}`;
}

/**
 * The delivery number inside a pasted search term, or `null` if the term is not one.
 *
 * Accepts what people actually paste: `GI-0091`, `gi 91`, or the bare `91`. Anything
 * with other text in it is not a reference and matches nothing here — the caller falls
 * back to its text columns.
 */
export function parseDeliveryReference(term: string): number | null {
  const match = /^\s*(?:gi[\s-]*)?0*(\d{1,9})\s*$/i.exec(term);
  if (!match || !match[1]) return null;
  return Number.parseInt(match[1], 10);
}

/**
 * `P01` — how a pallet is labelled on the floor and in a photo filename later. Two
 * digits because a lorry holds tens of pallets, not hundreds; a 100th pallet is `P100`.
 */
export function formatPalletLabel(palletNo: number): string {
  return `P${String(palletNo).padStart(2, "0")}`;
}

/**
 * The friendly name a downloaded file carries — the one place the paper form's naming
 * convention survives, because a name is a rendering, not storage. Objects live under
 * opaque keys and rows carry the metadata; these functions dress a download up as
 * `GI-0091_P01_20260713.jpg` or `GI-0091_CMR.pdf` at the moment someone saves it.
 */
export function formatPhotoDownloadName(
  deliveryNo: number,
  palletNo: number,
  deliveredOn: string,
  mimeType: UploadMimeType,
): string {
  const compactDate = deliveredOn.replace(/-/g, "");
  return `${formatDeliveryReference(deliveryNo)}_${formatPalletLabel(palletNo)}_${compactDate}.${UPLOAD_MIME_TYPES[mimeType]}`;
}

export function formatScanDownloadName(
  deliveryNo: number,
  docType: GoodsDocType,
  mimeType: UploadMimeType,
): string {
  const label = docType.replace(/_/g, "-").toUpperCase();
  return `${formatDeliveryReference(deliveryNo)}_${label}.${UPLOAD_MIME_TYPES[mimeType]}`;
}
