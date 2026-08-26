import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../lib/pagination.dto";
import { trimOptional } from "../../users/dto/create-user.dto";

export class ListSuppliersDto extends PaginationQueryDto {
  /** Case-insensitive substring match against the code and the name. */
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;
}

/**
 * The trash accepts the same shape — search and paging answer "where is the supplier I
 * deleted by mistake?", which is the only question a trash view has.
 */
export class ListTrashedSuppliersDto extends ListSuppliersDto {}
