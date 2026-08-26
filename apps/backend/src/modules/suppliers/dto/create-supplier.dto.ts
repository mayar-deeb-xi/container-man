import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

import { trimOptional } from "../../users/dto/create-user.dto";

export const SUPPLIER_NAME_MAX = 160;
export const SUPPLIER_NOTES_MAX = 2_000;

/**
 * The internal supplier number: `S014`, `S2-DE`, and the like. Uppercase letters,
 * digits and dashes, 2–20 characters — loose enough for whatever numbering the office
 * already uses, strict enough that a name pasted into the wrong field is refused
 * rather than becoming a "code" the paperwork then has to carry.
 */
export const SUPPLIER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

export class CreateSupplierDto {
  /** Normalized at the edge — uppercased, trimmed — so `s014` and `S014` are one code. */
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(SUPPLIER_CODE_PATTERN, {
    message: "code must be 2–20 uppercase letters, digits or dashes, e.g. S014",
  })
  code!: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(SUPPLIER_NAME_MAX)
  name!: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(SUPPLIER_NOTES_MAX)
  @IsOptional()
  notes?: string;
}
