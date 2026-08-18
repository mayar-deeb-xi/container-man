import { Exclude, Expose } from "class-transformer";

import type { UserRole } from "@repo/auth";

/**
 * Serialization allowlist for the user-management payload: the account record as
 * an operator sees it, with the timestamps that make a list of accounts legible.
 *
 * Every field is written out rather than inherited from the auth module's entity
 * of the same name. The two answer different questions — "who am I" versus "what
 * is this account" — and inheritance would tie them together, so a field exposed
 * for one would silently appear in the other. Spelling both out costs four lines
 * and makes each module's wire format readable in one place.
 *
 * `deletedAt` is deliberately absent: these endpoints only ever return live rows,
 * so a field that is always null would just invite a client to branch on it.
 */
@Exclude()
export class UserEntity {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
  @Expose() role: UserRole;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
}
