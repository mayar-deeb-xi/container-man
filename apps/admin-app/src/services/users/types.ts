import type { Pagination } from "~/lib/base-response";
import type { UserRole } from "~/services/auth/types";

/**
 * Client-side mirror of what `/users` returns — the users module's `UserEntity`,
 * in `apps/backend/src/modules/users/entities/user.entity.ts`, which is the source
 * of truth for which columns are exposed.
 *
 * Every field is spelled out rather than extending the signed-in identity in
 * `~/services/auth/types`. The two answer different questions — "what is this
 * account" versus "who am I" — and the backend keeps them as two separate
 * entities for exactly that reason; inheriting here would re-couple what it
 * deliberately split, so a field exposed to one endpoint would appear on the
 * other's type without anyone deciding it should.
 *
 * The timestamps are strings, not `Date`s: JSON has no date type, and nothing
 * here parses them back. Format them at the point of display.
 */
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

/** The filters that make one page of users a distinct query — and cache entry. */
export interface UsersQueryFilters {
  skip: number;
  take: number;
  search?: string;
  role?: UserRole;
}

export interface UsersPage {
  users: User[];
  pagination: Pagination;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
}

/** Every field optional — an absent key leaves that column alone. */
export interface UpdateUserPayload {
  email?: string;
  password?: string;
  /** `null` clears the name; `undefined` leaves it as it was. */
  name?: string | null;
  role?: UserRole;
}
