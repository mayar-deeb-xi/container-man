import type { AppAction, AppRule, AppSubject } from "@repo/access";

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
 *
 * The exception is the rule shape, which *is* imported from `@repo/access`. It is not
 * a description of one endpoint's response but the format CASL evaluates, and both
 * sides have to construct the identical ability from it — a mirrored copy that drifted
 * would mean a console that shows buttons the API refuses. What the wire carries and
 * what the ability is built from are the same object by design.
 */
export type { AppAction, AppRule, AppSubject };

/** A role the signed-in user holds. Keys are what code compares; names are shown. */
export interface SessionRole {
  id: string;
  key: string;
  name: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  roles: SessionRole[];
  /** Already resolved for this user — placeholders substituted by the backend. */
  rules: AppRule[];
}
