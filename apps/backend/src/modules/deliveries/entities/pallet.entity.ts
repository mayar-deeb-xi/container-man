import { Exclude, Expose, Type } from "class-transformer";

import type { PackingType, WasteClassification, WeeeCategory } from "@repo/goods-in";

/** The account that checked a pallet, reduced to what a table row needs. */
@Exclude()
export class PalletWorkerEntity {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
}

/**
 * Serialization allowlist for one pallet — a line of the goods-in record.
 *
 * Two of these fields exist nowhere in the database, by design: `netWeightKg` is gross
 * minus tare (stored, it could disagree with them — the same reasoning as a container's
 * payload), and `palletLabel` is formatting over `palletNo`. The service fills both
 * from `@repo/goods-in`, which is the one definition of each.
 */
@Exclude()
export class PalletEntity {
  @Expose() id: string;
  @Expose() deliveryId: string;
  /** Position within the delivery, 1-based. */
  @Expose() palletNo: number;
  /** `P01` — how the floor and, later, photo filenames refer to it. Derived. */
  @Expose() palletLabel: string;
  @Expose() packing: PackingType;
  @Expose() material: string;
  @Expose() weeeCategory: WeeeCategory | null;
  @Expose() grossWeightKg: number;
  /** The tare actually applied — standard for the packing, or weighed for `special`. */
  @Expose() tareKg: number;
  /** Gross minus tare. Sent, not stored, and not left to the client. */
  @Expose() netWeightKg: number;
  @Expose() quantityPcs: number | null;
  @Expose() classification: WasteClassification | null;
  @Expose() notice: string | null;

  /** Resolved, because the record answers "who checked this?" with a name, not an id. */
  @Expose()
  @Type(() => PalletWorkerEntity)
  worker: PalletWorkerEntity;

  @Expose() workerId: string;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
}
