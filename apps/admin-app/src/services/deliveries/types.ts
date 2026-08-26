import type {
  DeliveryStatus,
  GoodsDocType,
  PackingType,
  WasteClassification,
  WeeeCategory,
} from "@repo/goods-in";

import type { Pagination } from "~/lib/base-response";

/**
 * Client-side mirrors of what `/deliveries` returns — the backend's entities in
 * `apps/backend/src/modules/deliveries/entities/` are the source of truth.
 *
 * The supplier arrives as `{ id, code }` and nothing more: names live behind
 * `read Supplier`, and this shape is how the API keeps the paper form's
 * confidentiality rule. `deliveredOn` stays a `YYYY-MM-DD` string for the same
 * reason the container dates do — parsing it would attach a timezone.
 */
export interface DeliverySupplier {
  id: string;
  code: string;
}

export interface DeliveryActor {
  id: string;
  email: string;
  name: string | null;
}

export interface Delivery {
  id: string;
  /** The register number the database assigned. */
  deliveryNo: number;
  /** `GI-0091` — derived from `deliveryNo` by the API, never stored. */
  reference: string;
  status: DeliveryStatus;
  deliveredOn: string;
  lotNo: string | null;
  /** Which papers physically arrived with the lorry. */
  documents: GoodsDocType[];
  supplier: DeliverySupplier;
  supplierId: string;
  palletCount: number;
  /** The sum of every pallet's gross minus tare, in kg — aggregated by the API. */
  totalNetWeightKg: number;
  signedBy: DeliveryActor | null;
  signedById: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pallet {
  id: string;
  deliveryId: string;
  palletNo: number;
  /** `P01` — derived. */
  palletLabel: string;
  packing: PackingType;
  material: string;
  weeeCategory: WeeeCategory | null;
  grossWeightKg: number;
  /** The tare actually applied — standard for the packing, weighed for `special`. */
  tareKg: number;
  /** Gross minus tare, derived by the API. */
  netWeightKg: number;
  quantityPcs: number | null;
  classification: WasteClassification | null;
  notice: string | null;
  worker: DeliveryActor;
  workerId: string;
  createdAt: string;
  updatedAt: string;
}

/** A pallet photo or a document scan. The bytes stream through their own endpoint. */
export interface DeliveryFile {
  id: string;
  deliveryId: string;
  palletId: string | null;
  palletLabel: string | null;
  docType: GoodsDocType | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** `GI-0091_P01_20260713.jpg` — the name a download carries, derived by the API. */
  downloadName: string;
  uploadedBy: DeliveryActor;
  uploadedById: string;
  createdAt: string;
}

export interface DeliveryDetail extends Delivery {
  pallets: Pallet[];
  files: DeliveryFile[];
}

export interface TrashedDelivery extends Delivery {
  deletedAt: string;
}

export interface DeliveriesQueryFilters {
  skip: number;
  take: number;
  search?: string;
  status?: DeliveryStatus;
  supplierId?: string;
  deliveredFrom?: string;
  deliveredTo?: string;
}

export interface DeliveriesPage {
  deliveries: Delivery[];
  pagination: Pagination;
}

export interface TrashedDeliveriesQueryFilters {
  skip: number;
  take: number;
  search?: string;
}

export interface TrashedDeliveriesPage {
  deliveries: TrashedDelivery[];
  pagination: Pagination;
}

export interface CreateDeliveryPayload {
  supplierId: string;
  deliveredOn: string;
  lotNo?: string;
  documents?: GoodsDocType[];
}

/** Drafts only — the API refuses any of this on a signed delivery. */
export interface UpdateDeliveryPayload {
  supplierId?: string;
  deliveredOn?: string;
  lotNo?: string | null;
  /** `null` clears the checklist. */
  documents?: GoodsDocType[] | null;
}

export interface CreatePalletPayload {
  packing: PackingType;
  material: string;
  grossWeightKg: number;
  /** Required for `special` packing, refused on any other — the standard tares are the API's. */
  tareKg?: number;
  weeeCategory?: WeeeCategory;
  quantityPcs?: number;
  classification?: WasteClassification;
  notice?: string;
  /** Defaults to the signed-in account. */
  workerId?: string;
}

export interface UpdatePalletPayload {
  packing?: PackingType;
  material?: string;
  grossWeightKg?: number;
  tareKg?: number;
  weeeCategory?: WeeeCategory | null;
  quantityPcs?: number | null;
  classification?: WasteClassification | null;
  notice?: string | null;
  workerId?: string;
}

/** Exactly one of the two: a photo belongs to a pallet, a scan to a document type. */
export interface UploadFilePayload {
  file: File | Blob;
  fileName: string;
  palletId?: string;
  docType?: GoodsDocType;
}
