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

import type { WritableKeys } from "@repo/access";
import { GOODS_DOC_TYPES } from "@repo/goods-in";

import { trimOptional } from "../../users/dto/create-user.dto";
import { LOT_NO_MAX } from "./create-delivery.dto";

/**
 * A PATCH against a *draft* header — the service refuses any of this on a signed
 * delivery. `supplierId` and `deliveredOn` have no empty state; `lotNo` can be
 * un-known and `documents` cleared with `null` (stored as the empty checklist).
 */
export class UpdateDeliveryDto {
  @IsUUID("4")
  @IsOptional()
  supplierId?: string;

  @IsDateString({ strict: true, strictSeparator: true })
  @IsOptional()
  deliveredOn?: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(LOT_NO_MAX)
  @IsOptional()
  lotNo?: string | null;

  @IsArray()
  @ArrayUnique()
  @IsIn(GOODS_DOC_TYPES, { each: true })
  @IsOptional()
  documents?: (typeof GOODS_DOC_TYPES)[number][] | null;
}

/**
 * Every PATCH key is nameable in a rule's `fields` — the registry also lists `pallets`,
 * which is not a body key but the sub-resource routes' field, like `User.roles`.
 */
export type DeliveryPatchField = WritableKeys<"Delivery", keyof UpdateDeliveryDto>;
