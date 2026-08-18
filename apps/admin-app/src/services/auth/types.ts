/**
 * Hand-written mirror of the identity the auth endpoints return — login, refresh
 * and `/auth/me`. The source of truth is the backend's serialization allowlist in
 * `apps/backend/src/modules/auth/entities/user.entity.ts`; only fields `@Expose`d
 * there reach the wire.
 *
 * Deliberately not imported from `@repo/auth`. This app consumes an HTTP API, so
 * it describes the JSON it expects rather than sharing a compile-time type with
 * the server — a field added to the backend's entity should surface here as a
 * decision to make, not silently widen a type the UI already renders.
 */
export type UserRole = "admin" | "user";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}
