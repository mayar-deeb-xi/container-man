import type { Pagination } from "~/lib/base-response";
import type { AppRule, SessionRole } from "~/services/auth/types";

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
  /**
   * Every role the account holds. Plural, with no primary one: abilities are the union
   * of what these grant, so singling one out would misrepresent the model.
   *
   * The element type is shared with the session's roles rather than restated — "a role,
   * named" is one shape, and two copies of three fields would only invite them to
   * disagree about which is authoritative.
   */
  roles: SessionRole[];
  createdAt: string;
  updatedAt: string;
}

/** One rule from a user's effective set — their roles, resolved and flattened. */
export type EffectiveRule = AppRule;

/** The filters that make one page of users a distinct query — and cache entry. */
export interface UsersQueryFilters {
  skip: number;
  take: number;
  search?: string;
  /** A role's key, not its id: it is what the API filters on and what reads in a URL. */
  roleKey?: string;
}

export interface UsersPage {
  users: User[];
  pagination: Pagination;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name?: string;
  /** Omitted means the backend's default role; `[]` means an account that can do nothing. */
  roleIds?: string[];
}

/**
 * Every field optional — an absent key leaves that column alone.
 *
 * Roles are not here: they are replaced as a set through `useSetUserRoles`, which is
 * the same split the API makes and for the same reason — an omitted `roleIds` meaning
 * "leave them" while `[]` meant "strip everything" is one typo apart.
 */
export interface UpdateUserPayload {
  email?: string;
  password?: string;
  /** `null` clears the name; `undefined` leaves it as it was. */
  name?: string | null;
}
