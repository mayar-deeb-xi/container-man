import { z } from "zod";

/**
 * Mirrors the backend's LoginDto constraints. The duplication is deliberate: the
 * form needs instant client-side feedback, and the API must never trust it.
 */
export const loginSchema = z.object({
  email: z.email({ error: "Enter a valid email address" }),
  password: z
    .string()
    .min(8, { error: "Password must be at least 8 characters" })
    .max(128, { error: "Password is too long" }),
});

export type LoginInput = z.infer<typeof loginSchema>;
