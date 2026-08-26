import { Exclude, Expose, Type } from "class-transformer";

import type { DeliveryStatus, GoodsDocType } from "@repo/goods-in";

import { DeliveryFileEntity } from "./file.entity";
import { PalletEntity } from "./pallet.entity";

/**
 * The supplier as goods-in shows it: the id to filter by and the code the paperwork
 * carries. Deliberately *not* the name — that is the paper form's confidentiality rule
 * kept properly: the name lives behind `read Supplier`, and this allowlist is what
 * keeps it off the goods-in wire even though the service joins the full row.
 */
@Exclude()
export class DeliverySupplierEntity {
  @Expose() id: string;
  @Expose() code: string;
}

/** The account that signed the record off. */
@Exclude()
export class DeliverySignerEntity {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
}

/**
 * Serialization allowlist for a delivery — the goods-in register's row shape.
 *
 * `reference` is formatting over `deliveryNo` (`GI-0091`), derived at read time; the
 * paper form's composed Delivery ID has no column here at all. `palletCount` and
 * `totalNetWeightKg` are aggregates the register view would otherwise compute with a
 * request per row.
 */
@Exclude()
export class DeliveryEntity {
  @Expose() id: string;
  /** The register number the database assigned. */
  @Expose() deliveryNo: number;
  /** `GI-0091` — the reference a human quotes. Derived from `deliveryNo`. */
  @Expose() reference: string;
  @Expose() status: DeliveryStatus;
  /** `YYYY-MM-DD`; a date, so there is no time of day to misread. */
  @Expose() deliveredOn: string;
  @Expose() lotNo: string | null;
  /** Which papers arrived with the delivery. */
  @Expose() documents: GoodsDocType[];

  @Expose()
  @Type(() => DeliverySupplierEntity)
  supplier: DeliverySupplierEntity;

  /** The raw fk as well as the resolved supplier — conditions are written against columns. */
  @Expose() supplierId: string;

  /** How many pallets the record holds so far. */
  @Expose() palletCount: number;
  /** The sum of every pallet's gross minus tare, in kg. */
  @Expose() totalNetWeightKg: number;

  @Expose()
  @Type(() => DeliverySignerEntity)
  signedBy: DeliverySignerEntity | null;

  @Expose() signedById: string | null;
  @Expose() signedAt: Date | null;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
}

/** The detail view: the header, every pallet in floor order, and the attached files. */
@Exclude()
export class DeliveryDetailEntity extends DeliveryEntity {
  @Expose()
  @Type(() => PalletEntity)
  pallets: PalletEntity[];

  /** Pallet photos and document scans — metadata only; the bytes stream per file. */
  @Expose()
  @Type(() => DeliveryFileEntity)
  files: DeliveryFileEntity[];
}

/** A delivery as the trash returns it — always a draft, always with a deletion time. */
@Exclude()
export class TrashedDeliveryEntity extends DeliveryEntity {
  @Expose() deletedAt: Date;
}
