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
import { MATERIAL_MAX, MAX_QUANTITY_PCS, NOTICE_MAX } from "./create-pallet.dto";

/**
 * A PATCH against one pallet of a *draft* delivery.
 *
 * The nullable fields are the ones an operator can legitimately un-know — a category
 * guessed wrong, a classification reopened, a notice withdrawn. `packing`, `material`,
 * the weights and the worker have no empty state. The tare follows the packing: the
 * service recomputes it when `packing` changes and accepts `tareKg` only for `special`.
 */
export class UpdatePalletDto {
  @IsIn(PACKING_TYPES)
  @IsOptional()
  packing?: (typeof PACKING_TYPES)[number];

  @Transform(trimOptional)
  @IsString()
  @MaxLength(MATERIAL_MAX)
  @IsOptional()
  material?: string;

  @IsInt()
  @Min(1)
  @Max(MAX_PALLET_GROSS_KG)
  @IsOptional()
  grossWeightKg?: number;

  @IsInt()
  @Min(0)
  @Max(MAX_SPECIAL_TARE_KG)
  @IsOptional()
  tareKg?: number;

  @IsIn(WEEE_CATEGORIES)
  @IsOptional()
  weeeCategory?: (typeof WEEE_CATEGORIES)[number] | null;

  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY_PCS)
  @IsOptional()
  quantityPcs?: number | null;

  @IsIn(WASTE_CLASSIFICATIONS)
  @IsOptional()
  classification?: (typeof WASTE_CLASSIFICATIONS)[number] | null;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(NOTICE_MAX)
  @IsOptional()
  notice?: string | null;

  @IsUUID("4")
  @IsOptional()
  workerId?: string;
}
