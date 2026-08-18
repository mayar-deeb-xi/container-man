import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { UserRole } from "@repo/auth";

import type { RequestWithUser } from "../modules/auth/auth.types";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { UsersService } from "../modules/users/users.service";

/**
 * Role check for routes already behind `JwtAccessGuard` — list it second, since
 * it reads the payload that guard attaches.
 *
 * The role is re-read from the database rather than trusted from the token. The
 * access token is valid for 15 minutes, so a token-only check would let someone
 * demoted (or deleted) a moment ago keep acting as an admin until it expired.
 * `findById` filters out soft-deleted rows, which is what closes that window for
 * deletion as well. It costs one indexed lookup on the handful of routes that
 * are actually privileged.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException("Not authenticated");
    }

    const user = await this.users.findById(request.user.sub);
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
