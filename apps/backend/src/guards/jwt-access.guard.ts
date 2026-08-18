import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

import { ACCESS_TOKEN_COOKIE } from "@repo/auth";
import { verifyAccessToken } from "@repo/auth/jwt";

import type { RequestWithUser } from "../modules/auth/auth.types";
import { AppConfigService } from "../config/app-config.service";

/**
 * Verifies the access token with the same `@repo/auth/jwt` helpers the admin app's
 * proxy uses. Deliberately not passport-jwt: that would introduce a second JWT
 * implementation, and the two could drift on algorithm or claim handling.
 */
@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;

    if (!token) {
      throw new UnauthorizedException("Not authenticated");
    }

    const result = await verifyAccessToken(token, this.config.accessSecret);
    if (result.status !== "valid") {
      // Both cases are a 401 — the client's refresh interceptor is what decides
      // whether to retry, and telling it which failure occurred would only help
      // an attacker probing for a valid signature.
      throw new UnauthorizedException(
        result.status === "expired" ? "Access token expired" : "Invalid access token",
      );
    }

    request.user = result.payload;
    return true;
  }
}
