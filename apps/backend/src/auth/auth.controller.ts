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
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import type { AccessTokenPayload, PublicUser } from "@repo/auth";
import {
  ACCESS_TOKEN_COOKIE,
  buildClearCookieOptions,
  buildCookieOptions,
  REFRESH_TOKEN_COOKIE,
} from "@repo/auth";

import type { AuthResult, RequestMeta } from "./auth.service";
import type { RequestWithRefresh } from "./auth.types";
import { AppConfigService } from "../config/app-config.service";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { JwtAccessGuard } from "./guards/jwt-access.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
  ) {}

  /** There is no registration endpoint — users come from `pnpm db:seed`. */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    const result = await this.auth.login(dto, this.meta(req));
    this.setAuthCookies(res, result);
    return result.user;
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  async refresh(
    @Req() req: RequestWithRefresh,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicUser> {
    try {
      const result = await this.auth.refresh(
        req.refresh.payload,
        req.refresh.token,
        this.meta(req),
      );
      this.setAuthCookies(res, result);
      return result.user;
    } catch (error) {
      // A dead refresh token means the browser is holding cookies that will fail
      // on every subsequent request; clear them so the client settles on /login
      // instead of looping through the refresh interceptor.
      this.clearAuthCookies(res);
      throw error;
    }
  }

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
  async me(@CurrentUser() payload: AccessTokenPayload): Promise<PublicUser> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }
    return UsersService.toPublic(user);
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
