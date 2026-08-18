import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

import { PERMISSION_CATALOG } from "@repo/access";

import { trimOptional } from "../../users/dto/create-user.dto";
import { RuleDto } from "./rule.dto";

export const ROLE_KEY_MAX = 50;
export const ROLE_NAME_MAX = 80;
export const ROLE_DESCRIPTION_MAX = 300;

/**
 * A role's stable identifier. Lowercase, no spaces: it appears in URLs, filters and
 * code (`SUPER_ROLE_KEY`), whereas `name` is what an operator reads and may change
 * freely. Keeping the two apart is what makes a rename harmless.
 */
export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

/** An upper bound on the rules one role may hold — one per catalog entry is enough. */
export const MAX_RULES_PER_ROLE = PERMISSION_CATALOG.length;

export class CreateRoleDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(ROLE_KEY_MAX)
  @Matches(ROLE_KEY_PATTERN, {
    message: "key must start with a letter and contain only lowercase letters, digits and dashes",
  })
  key!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(ROLE_NAME_MAX)
  name!: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(ROLE_DESCRIPTION_MAX)
  @IsOptional()
  description?: string;

  /**
   * The permissions to grant immediately. Optional, and an omitted list means a role
   * that grants nothing — which is a sensible thing to create, then fill in from the
   * matrix editor.
   *
   * `@Type` is required for `@ValidateNested` to run: without it the array arrives as
   * plain objects and every rule's own validation is skipped silently.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  @ArrayMaxSize(MAX_RULES_PER_ROLE)
  @IsOptional()
  rules?: RuleDto[];
}
