import { Transform } from "class-transformer";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

import { DELIVERY_STATUSES } from "@repo/goods-in";

import { PaginationQueryDto } from "../../../lib/pagination.dto";
import { trimOptional } from "../../users/dto/create-user.dto";

export class ListDeliveriesDto extends PaginationQueryDto {
  /**
   * Matches the reference (`GI-0091`, or the bare number), the lot number, and the
   * supplier code — the three things a person holding paperwork actually has in hand.
   */
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @IsIn(DELIVERY_STATUSES)
  @IsOptional()
  status?: (typeof DELIVERY_STATUSES)[number];

  @IsUUID("4")
  @IsOptional()
  supplierId?: string;

  /** Inclusive date bounds on `deliveredOn` — a register is asked by week and by month. */
  @IsDateString({ strict: true, strictSeparator: true })
  @IsOptional()
  deliveredFrom?: string;

  @IsDateString({ strict: true, strictSeparator: true })
  @IsOptional()
  deliveredTo?: string;
}

/** The trash answers one question — search and paging are all it takes. */
export class ListTrashedDeliveriesDto extends PaginationQueryDto {
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;
}
