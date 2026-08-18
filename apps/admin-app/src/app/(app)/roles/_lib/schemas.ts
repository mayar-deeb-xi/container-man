import { z } from "zod";

/** Kept in step with the backend's `CreateRoleDto`. */
export const ROLE_KEY_MAX = 50;
export const ROLE_NAME_MAX = 80;
export const ROLE_DESCRIPTION_MAX = 300;
export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

/** The already-translated strings the schema needs. */
export interface RoleFormMessages {
  keyRequired: string;
  keyPattern: string;
  keyMax: string;
  nameRequired: string;
  nameMax: string;
  descriptionMax: string;
}

/**
 * Builds the role form's schema from resolved messages.
 *
 * Mirrors the backend DTO. The duplication is deliberate: the form needs instant
 * feedback, and the API must never trust it.
 */
export function createRoleFormSchema(messages: RoleFormMessages) {
  return z.object({
    key: z
      .string()
      .min(2, { error: messages.keyRequired })
      .max(ROLE_KEY_MAX, { error: messages.keyMax })
      .regex(ROLE_KEY_PATTERN, { error: messages.keyPattern }),
    name: z
      .string()
      .min(1, { error: messages.nameRequired })
      .max(ROLE_NAME_MAX, { error: messages.nameMax }),
    description: z.string().max(ROLE_DESCRIPTION_MAX, { error: messages.descriptionMax }),
  });
}

export type RoleFormInput = z.infer<ReturnType<typeof createRoleFormSchema>>;

/**
 * Turns a display name into a candidate key — `Release manager` → `release-manager`.
 *
 * Suggested, never enforced: the key is what code and URLs refer to, so it is offered
 * while the field is untouched and left alone the moment an operator types their own.
 */
export function suggestKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ROLE_KEY_MAX);
}
