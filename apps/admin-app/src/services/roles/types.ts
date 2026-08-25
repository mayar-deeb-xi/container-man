import type { AppAction, AppSubject } from "@repo/access";

import type { Pagination } from "~/lib/base-response";

/**
 * Client-side mirror of what `/roles` returns — the backend's `RoleEntity`, in
 * `apps/backend/src/modules/roles/entities/role.entity.ts`, which is the source of
 * truth for which columns are exposed.
 *
 * The timestamps are strings, not `Date`s: JSON has no date type, and nothing here
 * parses them back. Format them at the point of display.
 */
export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  /** System roles cannot be deleted — the console greys the action rather than 409ing. */
  isSystem: boolean;
  /** The superuser role: its rules are fixed in code, so the matrix is read-only. */
  isLocked: boolean;
  permissionCount: number;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One rule a role grants. `action` and `subject` identify the matrix cell;
 * `permissionId` is the catalog row behind it, carried so a client can key off the
 * catalog it already fetched.
 */
export interface RoleRule {
  permissionId: string;
  action: AppAction;
  subject: AppSubject;
  conditions: Record<string, unknown> | null;
  fields: string[] | null;
}

/** A single role with everything it grants — what the matrix editor loads. */
export interface RoleDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isLocked: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
  rules: RoleRule[];
}

export interface RolesQueryFilters {
  skip: number;
  take: number;
  search?: string;
}

export interface RolesPage {
  roles: Role[];
  pagination: Pagination;
}

/** A rule as it is sent — the id-free half of `RoleRule`, since the pair identifies it. */
export interface RulePayload {
  action: AppAction;
  subject: AppSubject;
  conditions?: Record<string, unknown> | null;
  fields?: string[] | null;
}

export interface CreateRolePayload {
  key: string;
  name: string;
  description?: string;
  rules?: RulePayload[];
}

/** Every field optional — an absent key leaves that column alone. */
export interface UpdateRolePayload {
  key?: string;
  name?: string;
  /** `null` clears the description; `undefined` leaves it as it was. */
  description?: string | null;
}
