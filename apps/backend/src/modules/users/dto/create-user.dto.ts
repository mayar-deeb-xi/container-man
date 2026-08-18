import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

import { MAX_ROLES_PER_USER } from "./set-user-roles.dto";

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

  /**
   * Roles to grant the new account. Ids rather than keys: the console has just listed
   * the roles to build its checkboxes, and an id cannot be ambiguous the way a key
   * renamed in another tab can.
   *
   * Omitted means the default role — an account with no roles could sign in and do
   * nothing, which is a reasonable state to *choose* but a poor one to arrive at by
   * leaving a field out. Send an empty array to mean it.
   */
  @IsArray()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(MAX_ROLES_PER_USER)
  @IsOptional()
  roleIds?: string[];
}
