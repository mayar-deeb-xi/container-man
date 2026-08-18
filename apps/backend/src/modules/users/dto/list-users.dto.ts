import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../lib/pagination.dto";
import { ROLE_KEY_MAX, ROLE_KEY_PATTERN } from "../../roles/dto/create-role.dto";
import { trimOptional } from "./create-user.dto";

export class ListUsersDto extends PaginationQueryDto {
  /** Case-insensitive substring match against email and name. */
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  /**
   * Filters to holders of one role, by key rather than id: this is a query string, and
   * `?roleKey=auditor` is something an operator can read, type and bookmark.
   *
   * Validated against the key pattern rather than a list of the roles that exist —
   * roles are data now, so an unknown key is an empty result rather than a 400.
   */
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(ROLE_KEY_MAX)
  @Matches(ROLE_KEY_PATTERN)
  @IsOptional()
  roleKey?: string;
}
