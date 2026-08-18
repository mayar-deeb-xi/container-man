import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import type { WritableKeys } from "@repo/access";

import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from "./create-user.dto";

/**
 * Every field optional — this is a PATCH, so an absent key means "leave it" while
 * a present one means "set it to this".
 *
 * Written out instead of `PartialType(CreateUserDto)` to avoid pulling in
 * `@nestjs/mapped-types` for one class, and because `name` differs: it is
 * nullable here, so clearing it is expressible.
 *
 * Roles are absent on purpose. Replacing a set has one sensible verb — PUT
 * /users/:id/roles — and folding it in here would make an omitted `roleIds` mean
 * "leave them" while `[]` meant "strip everything", one typo apart. Keeping it out
 * also puts the self-lockout check in exactly one place.
 */
export class UpdateUserDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "A valid email address is required" })
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Password must be at least ${PASSWORD_MIN} characters` })
  @MaxLength(PASSWORD_MAX)
  @IsOptional()
  password?: string;

  // Explicitly nullable: `@IsOptional()` waves `null` through, which is what lets
  // a client clear the name rather than only overwrite it.
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(NAME_MAX)
  @IsOptional()
  name?: string | null;
}

/**
 * Every key of this PATCH is nameable in a rule's `fields`, checked at compile time.
 *
 * A key missing from `WRITABLE_FIELDS.User` would be a column no rule can mention:
 * a role narrowed to every *other* field would leave this one writable, and nothing would
 * say so. Adding a field here without registering it does not build.
 */
export type UserPatchField = WritableKeys<"User", keyof UpdateUserDto>;
