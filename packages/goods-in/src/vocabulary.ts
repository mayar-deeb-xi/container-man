/**
 * What an incoming e-waste delivery *is*, as the console and the API both need to
 * describe it.
 *
 * Like `@repo/shipping`, these lists are the vocabulary behind the database's enums, the
 * DTO validators and the console's selects. The source material is a paper goods-in form;
 * what that form solved with legends and codes ("Documents attached: 1, 3, 5", a tare
 * table printed at the bottom) is solved here with named values the system applies
 * itself, so nothing downstream has to remember what "5" meant.
 */

/**
 * How a pallet is packed, in the words the scale station uses.
 *
 * `special` is the one the API treats specially — it is the only packing whose tare is
 * weighed individually rather than taken from `STANDARD_TARE_KG`.
 */
export const PACKING_TYPES = [
  "eur",
  "eur_bb",
  "eur_kar",
  "one_way",
  "owp_kart",
  "gitterbox",
  "special",
] as const;

export type PackingType = (typeof PACKING_TYPES)[number];

/** The packing whose tare cannot be looked up — it is weighed for that pallet alone. */
export const SPECIAL_PACKING: PackingType = "special";

/**
 * The standard empty weights, in kg — the legend the paper form printed at the bottom.
 *
 * The API fills the tare from this table rather than accepting one from the client, so
 * a standard packing cannot be filed with a wrong tare. The value is still *stored* on
 * the pallet row (snapshotted, not joined): a record signed under today's standard must
 * not change if the standard is ever re-measured. `special` maps to `null` because there
 * is nothing to look up.
 */
export const STANDARD_TARE_KG: Record<PackingType, number | null> = {
  eur: 23,
  eur_bb: 25,
  eur_kar: 27,
  one_way: 15,
  owp_kart: 18,
  gitterbox: 85,
  special: null,
};

/**
 * The papers that can accompany a delivery — the form's numbered legend, as names.
 *
 * A closed list rather than free text because the receiving clerk ticks what physically
 * arrived, and reporting later asks "which deliveries came without a weight certificate?"
 * — a question only a column of known values can answer.
 */
export const GOODS_DOC_TYPES = [
  "pallet_note",
  "cmr",
  "delivery_note",
  "packing_list",
  "weight_certificate",
  "annex_vii",
] as const;

export type GoodsDocType = (typeof GOODS_DOC_TYPES)[number];

/**
 * The routing decision for a checked pallet: scrap stream or reuse stream.
 *
 * Nullable on a draft row — the decision is often made after a look inside — but a
 * delivery cannot be signed while any pallet still lacks it: the classification is the
 * one output of goods-in that everything downstream (mass balance, Annex VII) consumes.
 */
export const WASTE_CLASSIFICATIONS = ["waste", "reuse"] as const;

export type WasteClassification = (typeof WASTE_CLASSIFICATIONS)[number];

/**
 * A delivery's lifecycle. Two states, deliberately.
 *
 * `draft` is editable — rows added, weights corrected, nothing final. `signed` is the
 * digital form of the worker's signature at the bottom of the form: from that moment the
 * record is immutable (GoBD keeps goods-in records unaltered for ten years), and the API
 * refuses every further write including deletion. There is no state after `signed`
 * because a correction to a signed record is a new record, not an edit.
 */
export const DELIVERY_STATUSES = ["draft", "signed"] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * EU WEEE collection categories, 1–6 as of Directive 2012/19/EU:
 * 1 temperature exchange, 2 screens, 3 lamps, 4 large equipment, 5 small equipment,
 * 6 small IT and telecommunication equipment.
 *
 * A number column rather than free text so the mass-balance report a recycler owes can
 * group by it. Kept separate from `material`, which stays free text — "defective
 * monitors, mixed brands" is for humans, the category is for the regulator.
 */
export const WEEE_CATEGORIES = [1, 2, 3, 4, 5, 6] as const;

export type WeeeCategory = (typeof WEEE_CATEGORIES)[number];

/**
 * What may be attached to a delivery: photos of pallets and scans of the papers.
 *
 * A closed list, checked on the server: an executable or an unknown blob in an
 * accounting record's evidence folder is a liability, not an attachment. The map's
 * values are the extension a generated download name carries.
 */
export const UPLOAD_MIME_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;

export type UploadMimeType = keyof typeof UPLOAD_MIME_TYPES;

/**
 * Per file, before upload. Generous for a phone photo or a scanned A4; anything larger
 * is a video or a mistake. Note the deployed ceiling may be lower than this — Vercel
 * caps request bodies around 4.5 MB, which is why the console downscales photos
 * client-side before sending them.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * More than any pallet a forklift moves: a value above this is a typo (a gross entered
 * in grams, a lorry weight in the pallet field), not a heavy pallet.
 */
export const MAX_PALLET_GROSS_KG = 5_000;

/** An individually weighed tare above this is not packaging. Zero is legal — loose goods. */
export const MAX_SPECIAL_TARE_KG = 1_000;

export function isPackingType(value: unknown): value is PackingType {
  return typeof value === "string" && (PACKING_TYPES as readonly string[]).includes(value);
}

export function isGoodsDocType(value: unknown): value is GoodsDocType {
  return typeof value === "string" && (GOODS_DOC_TYPES as readonly string[]).includes(value);
}

export function isWasteClassification(value: unknown): value is WasteClassification {
  return typeof value === "string" && (WASTE_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === "string" && (DELIVERY_STATUSES as readonly string[]).includes(value);
}

export function isWeeeCategory(value: unknown): value is WeeeCategory {
  return typeof value === "number" && (WEEE_CATEGORIES as readonly number[]).includes(value);
}

export function isUploadMimeType(value: unknown): value is UploadMimeType {
  return typeof value === "string" && value in UPLOAD_MIME_TYPES;
}
