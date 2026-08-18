import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { CookieConfig } from "@repo/auth";
import { parseDuration } from "@repo/auth";

import type { EnvironmentVariables } from "./env";

/**
 * Typed accessor over the validated env. Everything downstream reads config from
 * here, so the string-to-number/boolean coercions happen exactly once and cookie
 * lifetimes can never drift from the JWT lifetimes they mirror.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  private get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  get isProduction(): boolean {
    return this.get("NODE_ENV") === "production";
  }

  get port(): number {
    return Number(this.get("PORT"));
  }

  get webOrigin(): string {
    return this.get("WEB_ORIGIN");
  }

  get accessSecret(): string {
    return this.get("JWT_ACCESS_SECRET");
  }

  get refreshSecret(): string {
    return this.get("JWT_REFRESH_SECRET");
  }

  get accessTtl(): string {
    return this.get("ACCESS_TOKEN_TTL");
  }

  get refreshTtl(): string {
    return this.get("REFRESH_TOKEN_TTL");
  }

  get accessTtlMs(): number {
    return parseDuration(this.accessTtl);
  }

  get refreshTtlMs(): number {
    return parseDuration(this.refreshTtl);
  }

  get cookieConfig(): CookieConfig {
    const domain = this.get("COOKIE_DOMAIN");
    return {
      secure: this.get("COOKIE_SECURE") === "true",
      sameSite: this.get("COOKIE_SAMESITE") as CookieConfig["sameSite"],
      ...(domain ? { domain } : {}),
    };
  }
}
