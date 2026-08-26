import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../lib/pagination.dto";
import { trimOptional } from "./create-container.dto";

/**
 * The trash accepts search and paging, nothing else.
 *
 * The fleet list's filters answer operational questions — whose boxes, which depot, what
 * is due for inspection. The trash answers exactly one: "where is the row I deleted by
 * mistake?" A number to search for and a page to scroll cover that; offering the full
 * filter bar would dress a mistakes-bin up as a second register.
 */
export class ListTrashedContainersDto extends PaginationQueryDto {
  /** Same normalized matching as the live list — a pasted `mscu 123456` still resolves. */
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;
}
