import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { userRole } from "@repo/db";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 120;

/** Trims a string field and collapses an empty one to `undefined`. */
export const trimOptional = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export class CreateUserDto {
  // Same normalisation as LoginDto: emails are stored lowercased, so doing it at
  // the edge means no query has to remember to.
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: "A valid email address is required" })
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Password must be at least ${PASSWORD_MIN} characters` })
  @MaxLength(PASSWORD_MAX)
  password!: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(NAME_MAX)
  @IsOptional()
  name?: string;

  // `userRole.enumValues` rather than a hand-written list: the column and the
  // validator can then never disagree about what roles exist.
  @IsIn(userRole.enumValues)
  @IsOptional()
  role?: (typeof userRole.enumValues)[number];
}
