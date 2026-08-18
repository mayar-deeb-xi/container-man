import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";

import type { AccessTokenPayload } from "@repo/auth";

import type { RequestWithUser } from "../modules/auth/auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    return ctx.switchToHttp().getRequest<RequestWithUser>().user;
  },
);
