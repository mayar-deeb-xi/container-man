import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import {
  MAX_PALLET_GROSS_KG,
  MAX_SPECIAL_TARE_KG,
  PACKING_TYPES,
  WASTE_CLASSIFICATIONS,
  WEEE_CATEGORIES,
} from "@repo/goods-in";

import { trimOptional } from "../../users/dto/create-user.dto";

export const MATERIAL_MAX = 200;
export const NOTICE_MAX = 2_000;
export const MAX_QUANTITY_PCS = 100_000;

/**
 * One pallet as the scale station enters it.
 *
 * What the paper form's row asked for, minus everything the system does itself: no
 * pallet number (assigned sequentially), no net weight (derived), and no tare unless
 * the packing is `special` — the standard tares are the service's to apply, so a wrong
 * one cannot be filed.
 */
export class CreatePalletDto {
  @IsIn(PACKING_TYPES)
  packing!: (typeof PACKING_TYPES)[number];

  /** What is on the pallet, for humans — the category for reports is `weeeCategory`. */
  @Transform(trimOptional)
  @IsString()
  @MaxLength(MATERIAL_MAX)
  material!: string;

  /** Straight off the scale, in whole kg. */
  @IsInt()
  @Min(1)
  @Max(MAX_PALLET_GROSS_KG)
  grossWeightKg!: number;

  /**
   * Only meaningful — and required — for `special` packing, which is weighed
   * individually. The service refuses it on any standard packing rather than letting a
   * client override the legend. Zero is legal: loose goods weighed without packaging.
   */
  @IsInt()
  @Min(0)
  @Max(MAX_SPECIAL_TARE_KG)
  @IsOptional()
  tareKg?: number;

  /** EU WEEE collection category 1–6, when known at the scale. */
  @IsIn(WEEE_CATEGORIES)
  @IsOptional()
  weeeCategory?: (typeof WEEE_CATEGORIES)[number];

  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PCS)
  @IsOptional()
  quantityPcs?: number;

  /** Waste or reuse. May stay open on a draft; the sign-off requires it on every pallet. */
  @IsIn(WASTE_CLASSIFICATIONS)
  @IsOptional()
  classification?: (typeof WASTE_CLASSIFICATIONS)[number];

  @Transform(trimOptional)
  @IsString()
  @MaxLength(NOTICE_MAX)
  @IsOptional()
  notice?: string;

  /**
   * Who checked the pallet. Defaults to the signed-in account — stated explicitly only
   * when someone records a colleague's check. The service verifies it is a live user.
   */
  @IsUUID("4")
  @IsOptional()
  workerId?: string;
}
