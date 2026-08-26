import type { Pagination } from "~/lib/base-response";

/**
 * Client-side mirror of what `/suppliers` returns — the backend's `SupplierEntity` in
 * `apps/backend/src/modules/suppliers/entities/supplier.entity.ts` is the source of
 * truth for which columns are exposed.
 *
 * This is the one shape in the console that carries a supplier's *name*: it only comes
 * out of `/suppliers`, which sits behind `read Supplier`. Goods-in responses embed a
 * supplier as `{ id, code }` and never through this type.
 */
export interface Supplier {
  id: string;
  /** The internal supplier number, e.g. `S014` — what goods-in paperwork shows. */
  code: string;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A trash row — the live shape plus the one fact that defines the bin. */
export interface TrashedSupplier extends Supplier {
  deletedAt: string;
}

export interface SuppliersQueryFilters {
  skip: number;
  take: number;
  search?: string;
}

export interface SuppliersPage {
  suppliers: Supplier[];
  pagination: Pagination;
}

export interface TrashedSuppliersPage {
  suppliers: TrashedSupplier[];
  pagination: Pagination;
}

export interface CreateSupplierPayload {
  code: string;
  name: string;
  notes?: string;
}

/** An absent key leaves the column alone; `null` clears `notes`, the one clearable field. */
export interface UpdateSupplierPayload {
  code?: string;
  name?: string;
  notes?: string | null;
}
