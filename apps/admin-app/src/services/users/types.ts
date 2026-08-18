import type { PublicUser, UserRole } from "@repo/auth";

import type { Pagination } from "~/lib/base-response";

/**
 * Client-side mirror of what `/users` returns — the users module's `UserEntity`,
 * in `apps/backend/src/modules/users/entities/user.entity.ts`, which is the source
 * of truth for which columns are exposed.
 *
 * Named `AdminUser` on this side to keep it apart from `PublicUser`, the signed-in
 * identity these components also handle; the backend has no such collision, since
 * each module's entity is scoped by its folder.
 *
 * The timestamps are strings, not `Date`s: JSON has no date type, and nothing
 * here parses them back. Format them at the point of display.
 */
export interface AdminUser extends PublicUser {
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
  users: AdminUser[];
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
