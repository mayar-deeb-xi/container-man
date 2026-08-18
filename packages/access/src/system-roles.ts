import type { AppRule } from "./rules";

/**
 * The role every install has, and the one thing in this system that cannot be
 * revoked through the UI.
 *
 * `manage all` is CASL's superuser rule. It is defined here, in code, rather than
 * left to whatever the `role_permissions` table happens to contain: the console
 * can edit permissions, and a matrix that can strip the last full-access grant is
 * a console that can lock every operator out of the install. The API refuses to
 * modify this role's rules for the same reason.
 */
export const SUPER_ROLE_KEY = "admin";

/** Assigned to accounts created without an explicit role. */
export const DEFAULT_ROLE_KEY = "user";

export interface SystemRoleDefinition {
  key: string;
  name: string;
  description: string;
  rules: readonly Pick<AppRule, "action" | "subject">[];
}

/**
 * Seeded on every `pnpm db:seed`, and flagged `is_system` in the table so the API
 * can refuse to delete them. Their *names* stay editable — an install may want to
 * call `user` something else — but their keys are what code refers to.
 */
export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    key: SUPER_ROLE_KEY,
    name: "Administrator",
    description: "Unrestricted access to the console.",
    rules: [{ action: "manage", subject: "all" }],
  },
  {
    key: DEFAULT_ROLE_KEY,
    name: "User",
    description: "Can sign in and see the containers, nothing more.",
    rules: [{ action: "read", subject: "Container" }],
  },
];

export function isSuperRole(key: string): boolean {
  return key === SUPER_ROLE_KEY;
}
