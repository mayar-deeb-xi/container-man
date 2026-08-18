import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { RefreshTokenPayload } from "@repo/auth";
import type { User } from "@repo/db";
import { REFRESH_REUSE_GRACE_MS } from "@repo/auth";
import { signAccessToken, signRefreshToken } from "@repo/auth/jwt";
import {
  burnPasswordComparison,
  hashRefreshToken,
  timingSafeEqualHex,
  verifyPassword,
} from "@repo/auth/password";
import { sessions } from "@repo/db";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { LoginDto } from "./dto/login.dto";
import { AppConfigService } from "../../config/app-config.service";
import { baseResponse } from "../../lib/base.dto";
import { DRIZZLE } from "../../lib/db/db.module";
import { UsersService } from "../users/users.service";
import { UserEntity } from "./entities/user.entity";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * What a successful login or refresh produces: a session, and the token pair that
 * proves it. There is no response body — the controller's only job with this is
 * the cookie side effect, and a client that wants to know who it just signed in
 * as asks `/auth/me`.
 */
export interface AuthResult {
  tokens: TokenPair;
  sessionId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
  ) {}

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResult> {
    const user = await this.users.findByEmail(dto.email);

    if (!user) {
      // Spend the same argon2 time a real login would, so response latency can't
      // be used to enumerate which emails have accounts.
      await burnPasswordComparison();
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!(await verifyPassword(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.issueSession(user, meta);
  }

  /**
   * Rotates a refresh token: the presented one is revoked and a fresh pair issued.
   *
   * Because every refresh invalidates the previous token, a token presented twice
   * usually means it was captured — so instead of just rejecting it, every session
   * for that user is revoked, forcing a re-login on both attacker and victim.
   *
   * The exception is a rotation that was superseded moments ago (`replacedById`
   * set, within REFRESH_REUSE_GRACE_MS), which is an ordinary browser race rather
   * than theft.
   */
  async refresh(
    payload: RefreshTokenPayload,
    rawToken: string,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, payload.jti))
      .limit(1);

    if (!session) {
      throw new UnauthorizedException("Session not found");
    }

    // Check the token matches before anything else: an attacker replaying a
    // guessed token must not be able to influence a real session's state.
    if (!timingSafeEqualHex(session.refreshTokenHash, hashRefreshToken(rawToken))) {
      this.logger.warn(
        `Refresh token mismatch for user ${session.userId} (session ${session.id}); revoking all sessions`,
      );
      await this.revokeAllForUser(session.userId);
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (session.revokedAt) {
      const age = Date.now() - session.revokedAt.getTime();
      const isRace = session.replacedById !== null && age <= REFRESH_REUSE_GRACE_MS;

      if (!isRace) {
        this.logger.warn(
          `Refresh token reuse detected for user ${session.userId} (revoked session ${session.id}); revoking all sessions`,
        );
        await this.revokeAllForUser(session.userId);
        throw new UnauthorizedException("Session revoked");
      }

      // Two requests raced through rotation. Issue a fresh session rather than
      // punishing the loser — see REFRESH_REUSE_GRACE_MS.
      this.logger.debug(`Refresh race for session ${session.id} (${age}ms after rotation)`);
      const racedUser = await this.users.findById(session.userId);
      if (!racedUser) {
        throw new UnauthorizedException("User no longer exists");
      }
      return this.issueSession(racedUser, meta);
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException("Session expired");
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }

    const next = await this.issueSession(user, meta);
    await this.revokeSession(session.id, next.sessionId);
    return next;
  }

  async logout(sessionId: string): Promise<void> {
    await this.revokeSession(sessionId);
  }

  /**
   * The access token already carries `sub`, but the row is re-read so a user
   * deleted mid-session stops authenticating before their token expires.
   */
  async me(userId: string): Promise<BaseResponse<UserEntity>> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }
    return baseResponse(AuthService.toEntity(user));
  }

  /**
   * Row to identity payload. Auth maps to its own entity rather than borrowing the
   * users module's: this one answers "who am I", and must not start shipping row
   * metadata just because the account view wanted it.
   */
  private static toEntity(user: User): UserEntity {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private async issueSession(user: User, meta: RequestMeta): Promise<AuthResult> {
    // The session id is minted up front so it can be the refresh token's `jti`,
    // which makes rotation and reuse-detection a single primary-key lookup.
    const sessionId = randomUUID();

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(
        { userId: user.id, email: user.email, role: user.role, sessionId },
        this.config.accessSecret,
        this.config.accessTtl,
      ),
      signRefreshToken(
        { userId: user.id, sessionId },
        this.config.refreshSecret,
        this.config.refreshTtl,
      ),
    ]);

    await this.db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + this.config.refreshTtlMs),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
    });

    return { tokens: { accessToken, refreshToken }, sessionId };
  }

  /** `replacedById` marks a rotation, which is how a race is later told from theft. */
  private async revokeSession(sessionId: string, replacedById?: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date(), ...(replacedById ? { replacedById } : {}) })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}
