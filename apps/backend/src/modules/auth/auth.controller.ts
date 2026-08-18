import type { Request, Response } from "express";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";

import type { AccessTokenPayload, PublicUser } from "@repo/auth";
import {
  ACCESS_TOKEN_COOKIE,
  buildClearCookieOptions,
  buildCookieOptions,
  REFRESH_TOKEN_COOKIE,
} from "@repo/auth";

import type { BaseResponse } from "../../lib/base.dto";
import type { AuthResult, RequestMeta } from "./auth.service";
import type { RequestWithRefresh } from "./auth.types";
import { AppConfigService } from "../../config/app-config.service";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { JwtRefreshGuard } from "../../guards/jwt-refresh.guard";
import { BaseResponseDTO } from "../../lib/base.dto";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { UserEntity } from "./entities/user.entity";

/** The envelope for `/auth/me`, the one route here with a payload. */
const UserResponse = BaseResponseDTO(UserEntity);

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Signs in: the entire result is the two cookies on the response, hence 204.
   *
   * It deliberately does not echo the user back. Identity has one source — the
   * `/auth/me` below — so a client can never end up rendering a stale copy it was
   * handed at login instead of the current row.
   *
   * There is no registration endpoint; the first user comes from `pnpm db:seed`
   * and the rest from `POST /users`.
   */
  @Post("login")
  @HttpCode(HttpStatus.NO_CONTENT)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const result = await this.auth.login(dto, this.meta(req));
    this.setAuthCookies(res, result);
  }

  /** Rotates the token pair. Like login, the cookies are the whole answer. */
  @Post("refresh")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtRefreshGuard)
  async refresh(
    @Req() req: RequestWithRefresh,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    try {
      const result = await this.auth.refresh(
        req.refresh.payload,
        req.refresh.token,
        this.meta(req),
      );
      this.setAuthCookies(res, result);
    } catch (error) {
      // A dead refresh token means the browser is holding cookies that will fail
      // on every subsequent request; clear them so the client settles on /login
      // instead of looping through the refresh interceptor.
      this.clearAuthCookies(res);
      throw error;
    }
  }

  /**
   * 204 as well, for the same reason as the two above: there is nothing to say
   * beyond "it worked", and Express drops any payload written alongside a 204 —
   * an envelope here would be silently discarded rather than merely redundant.
   */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAccessGuard)
  async logout(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.sid);
    this.clearAuthCookies(res);
  }

  @Get("me")
  @UseGuards(JwtAccessGuard)
  @SerializeOptions({ type: UserResponse })
  async me(@CurrentUser() payload: AccessTokenPayload): Promise<BaseResponse<PublicUser>> {
    return this.auth.me(payload.sub);
  }

  private meta(req: Request): RequestMeta {
    return { userAgent: req.get("user-agent") ?? undefined, ip: req.ip };
  }

  private setAuthCookies(res: Response, result: AuthResult): void {
    const cookies = this.config.cookieConfig;
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      result.tokens.accessToken,
      buildCookieOptions(cookies, this.config.accessTtlMs),
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.tokens.refreshToken,
      buildCookieOptions(cookies, this.config.refreshTtlMs),
    );
  }

  private clearAuthCookies(res: Response): void {
    const options = buildClearCookieOptions(this.config.cookieConfig);
    res.clearCookie(ACCESS_TOKEN_COOKIE, options);
    res.clearCookie(REFRESH_TOKEN_COOKIE, options);
  }
}
