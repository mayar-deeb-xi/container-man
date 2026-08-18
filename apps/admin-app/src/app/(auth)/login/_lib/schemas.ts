import { z } from "zod";

/** Kept in step with the backend's `LoginDto`. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** The already-translated strings the schema needs. */
export interface LoginSchemaMessages {
  emailInvalid: string;
  passwordMin: string;
  passwordMax: string;
}

/**
 * Builds the sign-in schema from resolved messages.
 *
 * Takes finished strings rather than a translator so the schema stays free of any
 * i18n dependency, and a factory rather than a module constant because a schema
 * evaluated at import time would be frozen in whatever locale loaded first.
 *
 * Mirrors the backend's LoginDto constraints. The duplication is deliberate: the
 * form needs instant client-side feedback, and the API must never trust it.
 */
export function createLoginSchema(messages: LoginSchemaMessages) {
  return z.object({
    email: z.email({ error: messages.emailInvalid }),
    password: z
      .string()
      .min(PASSWORD_MIN, { error: messages.passwordMin })
      .max(PASSWORD_MAX, { error: messages.passwordMax }),
  });
}

export type LoginInput = z.infer<ReturnType<typeof createLoginSchema>>;
