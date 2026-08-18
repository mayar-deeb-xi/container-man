import type { AppAction, AppSubject } from "@repo/access";

/**
 * One grantable permission — a cell the matrix can offer.
 *
 * Client-side mirror of the backend's `PermissionEntity`. The catalog is fetched
 * rather than imported from `@repo/access` even though the constant is right there:
 * what a role may be granted is whatever the *database* holds, and an install running
 * a backend one deploy behind would otherwise be offered checkboxes it cannot save.
 */
export interface Permission {
  id: string;
  action: AppAction;
  subject: AppSubject;
  description: string | null;
}
