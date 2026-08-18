import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  isUUID,
  MaxLength,
  registerDecorator,
  ValidationOptions,
} from "class-validator";

import {
  CONTAINER_CONDITIONS,
  CONTAINER_SIZES_FT,
  CONTAINER_STATUSES,
  CONTAINER_TYPES,
} from "@repo/shipping";

import { PaginationQueryDto } from "../../../lib/pagination.dto";
import { trimOptional } from "./create-container.dto";

/** The `assignedToId` value meaning "nobody" — a uuid filter cannot express absence. */
export const UNASSIGNED = "unassigned";

/**
 * Accepts a user id or the literal `unassigned`.
 *
 * Written as one validator rather than stacked decorators because the two forms are
 * alternatives: `@IsUUID()` would reject the sentinel, and dropping it would accept any
 * string as an id and hand it to a uuid column to reject with a 500.
 */
function IsAssigneeFilter(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: "isAssigneeFilter",
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === "string" && (value === UNASSIGNED || isUUID(value, "4")),
        defaultMessage: () => `assignedToId must be a user id or "${UNASSIGNED}"`,
      },
    });
  };
}

export class ListContainersDto extends PaginationQueryDto {
  /**
   * Case-insensitive substring match against the container number, operator and depot.
   *
   * The number is matched after the same normalization the column stores, so pasting
   * `mscu 123456` finds the box even though neither the space nor the case is in the row.
   */
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @IsIn(CONTAINER_STATUSES)
  @IsOptional()
  status?: (typeof CONTAINER_STATUSES)[number];

  @IsIn(CONTAINER_TYPES)
  @IsOptional()
  type?: (typeof CONTAINER_TYPES)[number];

  @IsIn(CONTAINER_CONDITIONS)
  @IsOptional()
  condition?: (typeof CONTAINER_CONDITIONS)[number];

  // Sent as a string in the query and compared as a number: the column is a smallint, and
  // `enableImplicitConversion` is off globally, so the conversion is explicit here.
  @Transform(({ value }) => (typeof value === "string" ? Number(value) : value))
  @IsIn(CONTAINER_SIZES_FT)
  @IsOptional()
  sizeFt?: (typeof CONTAINER_SIZES_FT)[number];

  /**
   * A user id, or the literal `unassigned`.
   *
   * Two questions share one parameter because they are the same question with a different
   * answer — "whose boxes are these?" — and a separate boolean flag would allow the
   * nonsensical combination of both at once.
   */
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsAssigneeFilter()
  @IsOptional()
  assignedToId?: string;

  /**
   * Boxes whose CSC examination has passed or falls within the next 30 days — the fleet
   * desk's daily view, and the one filter here that is a question rather than a column.
   *
   * Transformed before validation because a query string carries `"true"`, not `true`, and
   * the global pipe's implicit conversion is off.
   */
  @Transform(({ value }) => (typeof value === "string" ? value === "true" : value))
  @IsBoolean()
  @IsOptional()
  inspectionDue?: boolean;
}
