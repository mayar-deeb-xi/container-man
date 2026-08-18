import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../lib/pagination.dto";
import { trimOptional } from "../../users/dto/create-user.dto";

export class ListRolesDto extends PaginationQueryDto {
  /** Case-insensitive substring match against key and name. */
  @Transform(trimOptional)
  @IsString()
  @MaxLength(80)
  @IsOptional()
  search?: string;
}
