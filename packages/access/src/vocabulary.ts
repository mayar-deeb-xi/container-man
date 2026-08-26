/**
 * The vocabulary every authorization decision in this repo is expressed in.
 *
 * It lives in a shared package because the backend's guards and the admin app's
 * `<Can>` have to agree on it exactly: a rule stored as `update` / `Container`
 * must mean the same thing to the code that writes it, the code that enforces it,
 * and the code that hides a button because of it. Two hand-kept copies of these
 * lists would drift, and the failure would be silent — a rule that grants nothing
 * because nothing ever asks about that spelling.
 */

/**
 * `manage` is CASL's wildcard: it matches every other action, so it is the "all
 * verbs" row of the permission matrix rather than a verb of its own.
 */
export const ACTIONS = ["manage", "create", "read", "update", "delete"] as const;

export type AppAction = (typeof ACTIONS)[number];

/**
 * `all` is CASL's subject wildcard, so `manage all` is a superuser and `read all`
 * is a read-only operator. The rest name a resource; add a subject here when the
 * API grows one, and the permission catalog below is what makes it assignable.
 */
export const SUBJECTS = ["all", "User", "Role", "Container", "Supplier", "Delivery"] as const;

export type AppSubject = (typeof SUBJECTS)[number];

/** The subjects a permission can actually be written against, `all` excluded. */
export const RESOURCE_SUBJECTS = SUBJECTS.filter(
  (subject): subject is Exclude<AppSubject, "all"> => subject !== "all",
);

export function isAction(value: unknown): value is AppAction {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

export function isSubject(value: unknown): value is AppSubject {
  return typeof value === "string" && (SUBJECTS as readonly string[]).includes(value);
}

/** Stable identity for an (action, subject) pair — a matrix cell, a map key. */
export function permissionKey(action: string, subject: string): string {
  return `${action}:${subject}`;
}

export interface PermissionDefinition {
  action: AppAction;
  subject: AppSubject;
  /**
   * Operator-facing note stored alongside the row. Deliberately not what the
   * console renders — wording there is translated — but what makes the
   * `permissions` table readable to whoever opens it in a SQL client.
   */
  description: string;
}

/**
 * Every permission that may be granted, and therefore every cell the console's
 * matrix can offer. `packages/db`'s role seed upserts this list, so the table is a
 * projection of this array rather than a place new rows get invented.
 *
 * Nothing enforces that a granted permission is ever checked — a pair listed here
 * with no guard behind it simply grants nothing. That is the safe direction: the
 * catalog can lead the API.
 */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { action: "manage", subject: "all", description: "Full access to everything" },

  { action: "manage", subject: "User", description: "Full access to user accounts" },
  { action: "read", subject: "User", description: "View user accounts" },
  { action: "create", subject: "User", description: "Create user accounts" },
  { action: "update", subject: "User", description: "Edit user accounts, including their roles" },
  { action: "delete", subject: "User", description: "Delete user accounts" },

  { action: "manage", subject: "Role", description: "Full access to roles and permissions" },
  { action: "read", subject: "Role", description: "View roles and their permissions" },
  { action: "create", subject: "Role", description: "Create roles" },
  { action: "update", subject: "Role", description: "Edit roles and the permissions they grant" },
  { action: "delete", subject: "Role", description: "Delete roles" },

  { action: "manage", subject: "Container", description: "Full access to containers" },
  { action: "read", subject: "Container", description: "View containers" },
  { action: "create", subject: "Container", description: "Create containers" },
  { action: "update", subject: "Container", description: "Edit containers" },
  {
    action: "delete",
    subject: "Container",
    description: "Delete containers, view the trash, and restore from it",
  },

  { action: "manage", subject: "Supplier", description: "Full access to suppliers" },
  {
    action: "read",
    subject: "Supplier",
    description: "View suppliers, including their names — goods-in records alone show only codes",
  },
  { action: "create", subject: "Supplier", description: "Create suppliers" },
  { action: "update", subject: "Supplier", description: "Edit suppliers" },
  {
    action: "delete",
    subject: "Supplier",
    description: "Delete suppliers with no recorded deliveries, view the trash, and restore",
  },

  { action: "manage", subject: "Delivery", description: "Full access to goods-in deliveries" },
  { action: "read", subject: "Delivery", description: "View deliveries and their pallets" },
  { action: "create", subject: "Delivery", description: "Record new deliveries" },
  {
    action: "update",
    subject: "Delivery",
    description: "Edit draft deliveries and their pallets, and sign them off",
  },
  {
    action: "delete",
    subject: "Delivery",
    description: "Delete draft deliveries, view the trash, and restore from it",
  },
];
