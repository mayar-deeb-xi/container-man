import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/** Upper bound on `take`, so a client cannot ask for the whole table at once. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Query parameters every list endpoint accepts.
 *
 * Named to match the `Pagination` half of the response envelope on purpose: what
 * you send back is what you get back, so a client can page by echoing the
 * previous response's `skip`/`take` rather than translating between two vocabularies.
 *
 * The explicit `@Type` conversions are required — the global ValidationPipe runs
 * with `enableImplicitConversion: false`, so without them every query string
 * would arrive as a string and fail `@IsInt`.
 */
export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  skip: number = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @IsOptional()
  take: number = DEFAULT_PAGE_SIZE;
}
