import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { userRole } from "@repo/db";

import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from "./create-user.dto";

/**
 * Every field optional — this is a PATCH, so an absent key means "leave it" while
 * a present one means "set it to this".
 *
 * Written out instead of `PartialType(CreateUserDto)` to avoid pulling in
 * `@nestjs/mapped-types` for one class, and because `name` differs: it is
 * nullable here, so clearing it is expressible.
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

  @IsIn(userRole.enumValues)
  @IsOptional()
  role?: (typeof userRole.enumValues)[number];
}
