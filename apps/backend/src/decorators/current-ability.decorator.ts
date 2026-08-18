import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator, InternalServerErrorException } from "@nestjs/common";

import type { AppAbility } from "@repo/access";

import type { RequestWithUser } from "../modules/auth/auth.types";

/**
 * The caller's ability, as resolved by `AbilityGuard` earlier in the request.
 *
 * Reusing the guard's instance rather than building a fresh one keeps a handler's
 * conditional checks consistent with the gate that let it run, and saves the two
 * queries a second resolution would cost.
 *
 * Throws rather than returning an empty ability when the guard did not run: a route
 * asking for this without `AbilityGuard` is a wiring mistake, and a silently
 * permissive default is the version of that mistake nobody notices.
 */
export const CurrentAbility = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AppAbility => {
    const { ability } = ctx.switchToHttp().getRequest<RequestWithUser>();

    if (!ability) {
      throw new InternalServerErrorException(
        "No ability on the request — the route is missing AbilityGuard.",
      );
    }

    return ability;
  },
);
