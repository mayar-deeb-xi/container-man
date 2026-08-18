import { z } from "zod";

/** Kept in step with the backend's `CreateUserDto`. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 120;

/** The already-translated strings the schema needs. */
export interface UserFormMessages {
  emailInvalid: string;
  passwordMin: string;
  passwordMax: string;
  nameMax: string;
}

/**
 * Builds the user form's schema from resolved messages.
 *
 * Same shape for both modes so one form component can serve create and edit; the
 * single difference is `requirePassword`. On edit the field doubles as "set a new
 * password", so an empty string is valid and means "leave it alone" — which is
 * why it is a union rather than `.optional()`: the input always yields a string.
 *
 * Mirrors the backend DTOs. The duplication is deliberate: the form needs instant
 * feedback, and the API must never trust it.
 */
export function createUserFormSchema(
  messages: UserFormMessages,
  { requirePassword }: { requirePassword: boolean },
) {
  const password = z
    .string()
    .min(PASSWORD_MIN, { error: messages.passwordMin })
    .max(PASSWORD_MAX, { error: messages.passwordMax });

  return z.object({
    name: z.string().max(NAME_MAX, { error: messages.nameMax }),
    email: z.email({ error: messages.emailInvalid }),
    password: requirePassword ? password : z.literal("").or(password),
    role: z.enum(["admin", "user"]),
  });
}

export type UserFormInput = z.infer<ReturnType<typeof createUserFormSchema>>;
