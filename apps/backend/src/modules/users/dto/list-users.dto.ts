import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

import { userRole } from "@repo/db";

import { PaginationQueryDto } from "../../../lib/pagination.dto";
import { trimOptional } from "./create-user.dto";

export class ListUsersDto extends PaginationQueryDto {
  /** Case-insensitive substring match against email and name. */
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @IsIn(userRole.enumValues)
  @IsOptional()
  role?: (typeof userRole.enumValues)[number];
}
