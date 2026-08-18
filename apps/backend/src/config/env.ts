import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { plainToInstance } from "class-transformer";
import {
  IsBooleanString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsPort,
  IsString,
  IsUrl,
  Matches,
  MinLength,
  validateSync,
} from "class-validator";

const DURATION = /^\d+[smhd]$/;

export enum NodeEnv {
  Development = "development",
  Production = "production",
  Test = "test",
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsPort()
  PORT = "3001";

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // 32 chars is the floor for an HS256 secret to actually carry 256 bits.
  @IsString()
  @MinLength(32, { message: "JWT_ACCESS_SECRET must be at least 32 characters" })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: "JWT_REFRESH_SECRET must be at least 32 characters" })
  JWT_REFRESH_SECRET!: string;

  @Matches(DURATION, { message: 'ACCESS_TOKEN_TTL must look like "15m", "1h" or "7d"' })
  ACCESS_TOKEN_TTL = "15m";

  @Matches(DURATION, { message: 'REFRESH_TOKEN_TTL must look like "15m", "1h" or "7d"' })
  REFRESH_TOKEN_TTL = "7d";

  @IsUrl({ require_tld: false, protocols: ["http", "https"] })
  WEB_ORIGIN = "http://localhost:3000";

  /** Empty on localhost; a shared parent domain (".example.com") in production. */
  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  @IsBooleanString()
  COOKIE_SECURE = "false";

  @IsIn(["lax", "strict", "none"])
  COOKIE_SAMESITE = "lax";
}

/**
 * Runs before the Nest container is built, so a bad or missing variable fails the
 * process at boot with a readable list rather than surfacing as a runtime 500.
 */
export function validate(raw: Record<string, unknown>): EnvironmentVariables {
  // Blank strings in a .env file must fall back to the class defaults rather than
  // failing validation as empty values.
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ""));

  const config = plainToInstance(EnvironmentVariables, cleaned, {
    enableImplicitConversion: false,
    excludeExtraneousValues: false,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(", ")}`)
      .join("\n");
    throw new Error(
      `Invalid backend environment:\n${details}\n\nDid you copy .env.example to .env at the repo root?`,
    );
  }

  if (config.COOKIE_SAMESITE === "none" && config.COOKIE_SECURE !== "true") {
    throw new Error(
      'Invalid backend environment:\n  - COOKIE_SAMESITE="none" requires COOKIE_SECURE=true',
    );
  }

  return config;
}

/** The repo keeps one .env at the workspace root; find it regardless of cwd. */
export function findRootEnvFile(): string | undefined {
  let dir = process.cwd();
  const { root } = parse(dir);

  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    if (dir === root) return undefined;
    dir = dirname(dir);
  }
}
