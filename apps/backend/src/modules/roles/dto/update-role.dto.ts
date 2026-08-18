import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

import { trimOptional } from "../../users/dto/create-user.dto";
import {
  ROLE_DESCRIPTION_MAX,
  ROLE_KEY_MAX,
  ROLE_KEY_PATTERN,
  ROLE_NAME_MAX,
} from "./create-role.dto";

/**
 * A PATCH: an absent key leaves that column alone.
 *
 * `rules` is deliberately not here. Replacing a whole rule set is a different
 * operation from renaming a role — it is what the matrix editor saves, all cells at
 * once — so it gets its own endpoint (`PUT /roles/:id/permissions`) where "the list I
 * sent is now the list" is the obvious reading. Folded into this DTO, an omitted
 * `rules` would have to mean "leave them" while an empty array meant "revoke
 * everything", and those are one typo apart.
 */
export class UpdateRoleDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(ROLE_KEY_MAX)
  @Matches(ROLE_KEY_PATTERN, {
    message: "key must start with a letter and contain only lowercase letters, digits and dashes",
  })
  @IsOptional()
  key?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(ROLE_NAME_MAX)
  @IsOptional()
  name?: string;

  // Explicitly nullable, like a user's name: `@IsOptional()` waves `null` through,
  // which is what lets a description be cleared rather than only overwritten.
  @Transform(trimOptional)
  @IsString()
  @MaxLength(ROLE_DESCRIPTION_MAX)
  @IsOptional()
  description?: string | null;
}
