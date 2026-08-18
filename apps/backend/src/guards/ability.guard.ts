import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { createAppAbility } from "@repo/access";

import type { RequiredAbility } from "../decorators/require-ability.decorator";
import type { RequestWithUser } from "../modules/auth/auth.types";
import { ABILITY_KEY } from "../decorators/require-ability.decorator";
import { AbilityService } from "../lib/ability/ability.service";

/**
 * CASL check for routes already behind `JwtAccessGuard` — list it second, since it
 * reads the payload that guard attaches.
 *
 * Replaces the role check this project started with. The reasoning that made that
 * guard re-read the database still applies, and now applies to more: the token
 * carries no authorization at all, so roles, the permissions behind them, and the
 * existence of the account are all resolved here, per request. A user demoted a
 * moment ago is refused immediately instead of at the token's expiry.
 *
 * The resolved ability is attached to the request, so a handler that needs to test
 * a specific row (`@CurrentAbility()`) reuses it rather than paying for it twice.
 */
@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilities: AbilityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredAbility[] | undefined>(ABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException("Not authenticated");
    }

    // A route with no declared requirement still gets the ability attached when it
    // asked for one — `@CurrentAbility()` is how a handler decides per row, and it
    // would otherwise have to declare a requirement it does not have just to be
    // handed the tool.
    const access = await this.abilities.forUser(request.user.sub);
    if (!access) {
      throw new UnauthorizedException("User no longer exists");
    }

    const ability = createAppAbility(access.rules);
    request.ability = ability;
    request.roles = access.roles;

    if (!required?.length) return true;

    for (const { action, subject } of required) {
      if (!ability.can(action, subject)) {
        // The rule that refused may carry a reason — an inverted rule exists to
        // explain itself — so pass it on rather than a flat "forbidden".
        const rule = ability.relevantRuleFor(action, subject);
        throw new ForbiddenException(rule?.reason ?? "Insufficient permissions");
      }
    }

    return true;
  }
}
