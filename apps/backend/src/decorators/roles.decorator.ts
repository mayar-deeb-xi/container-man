import { SetMetadata } from "@nestjs/common";

import type { UserRole } from "@repo/auth";

export const ROLES_KEY = "roles";

/**
 * Restricts a route (or a whole controller) to the listed roles. Inert on its
 * own — `RolesGuard` is what reads this metadata.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
