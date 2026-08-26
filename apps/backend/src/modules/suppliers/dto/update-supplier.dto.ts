import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

import type { WritableKeys } from "@repo/access";

import { trimOptional } from "../../users/dto/create-user.dto";
import {
  SUPPLIER_CODE_PATTERN,
  SUPPLIER_NAME_MAX,
  SUPPLIER_NOTES_MAX,
} from "./create-supplier.dto";

/**
 * A PATCH: an absent key leaves the column alone. `code` and `name` have no meaningful
 * empty state, so neither accepts `null`; `notes` is the one field an operator can
 * legitimately un-know.
 */
export class UpdateSupplierDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(SUPPLIER_CODE_PATTERN, {
    message: "code must be 2–20 uppercase letters, digits or dashes, e.g. S014",
  })
  @IsOptional()
  code?: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(SUPPLIER_NAME_MAX)
  @IsOptional()
  name?: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(SUPPLIER_NOTES_MAX)
  @IsOptional()
  notes?: string | null;
}

/** Compile-time proof every PATCH key is nameable in a rule's `fields` — see Container. */
export type SupplierPatchField = WritableKeys<"Supplier", keyof UpdateSupplierDto>;
