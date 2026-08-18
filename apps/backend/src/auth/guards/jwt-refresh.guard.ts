import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

import { REFRESH_TOKEN_COOKIE } from "@repo/auth";
import { verifyRefreshToken } from "@repo/auth/jwt";

import type { RequestWithRefresh } from "../auth.types";
import { AppConfigService } from "../../config/app-config.service";

@Injectable()
export class JwtRefreshGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithRefresh>();
    const token = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!token) {
      throw new UnauthorizedException("No refresh token");
    }

    const result = await verifyRefreshToken(token, this.config.refreshSecret);
    if (result.status !== "valid") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // The raw token travels with the request because the service needs to hash it
    // and compare against the stored digest — signature validity alone doesn't
    // prove this is still the current token for the session.
    request.refresh = { payload: result.payload, token };
    return true;
  }
}
