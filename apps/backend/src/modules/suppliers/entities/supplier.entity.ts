import { Exclude, Expose } from "class-transformer";

/**
 * Serialization allowlist for a supplier — the full record, name included.
 *
 * This shape is only reachable through `/suppliers`, which sits behind its own grants;
 * goods-in responses embed a supplier as `{ id, code }` and never through this class.
 * That split is the paper form's "write the number, not the name" rule done properly:
 * confidentiality by permission rather than by omission.
 */
@Exclude()
export class SupplierEntity {
  @Expose() id: string;
  /** The internal supplier number, e.g. `S014` — what goods-in paperwork shows. */
  @Expose() code: string;
  @Expose() name: string;
  @Expose() notes: string | null;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
}

/** A supplier as the trash endpoint returns it — `deletedAt` is a fact here. */
@Exclude()
export class TrashedSupplierEntity extends SupplierEntity {
  @Expose() deletedAt: Date;
}
