import { Transform } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

import { GOODS_DOC_TYPES } from "@repo/goods-in";

import { trimOptional } from "../../users/dto/create-user.dto";

export const LOT_NO_MAX = 80;

/**
 * The header of a new goods-in record. Deliberately small: the delivery number, the
 * reference and the status are the system's to assign, and the paper form's composed
 * "Delivery ID" does not exist here at all — its parts are these columns.
 */
export class CreateDeliveryDto {
  /** The supplier register row; the service checks it is live. Names stay behind `read Supplier`. */
  @IsUUID("4")
  supplierId!: string;

  /** The day the lorry arrived — a date, no time of day to misread across timezones. */
  @IsDateString({ strict: true, strictSeparator: true })
  deliveredOn!: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(LOT_NO_MAX)
  @IsOptional()
  lotNo?: string;

  /** Which papers arrived with the lorry — named values, not the paper legend's numbers. */
  @IsArray()
  @ArrayUnique()
  @IsIn(GOODS_DOC_TYPES, { each: true })
  @IsOptional()
  documents?: (typeof GOODS_DOC_TYPES)[number][];
}
