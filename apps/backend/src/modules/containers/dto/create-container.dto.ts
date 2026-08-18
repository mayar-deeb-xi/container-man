import { Transform } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationOptions,
} from "class-validator";

import {
  CONTAINER_CONDITIONS,
  CONTAINER_SIZES_FT,
  CONTAINER_STATUSES,
  CONTAINER_TYPES,
  ISO_TYPE_CODE_PATTERN,
  isValidContainerNumber,
  MAX_GROSS_KG,
  MAX_TARE_KG,
  normalizeContainerNumber,
  UNLOCODE_PATTERN,
} from "@repo/shipping";

export const NOTES_MAX = 2_000;
export const OPERATOR_MAX = 80;
export const DEPOT_MAX = 120;

/** Reefers run between roughly these two; outside it the value is a typo, not a setpoint. */
export const MIN_SETPOINT_C = -40;
export const MAX_SETPOINT_C = 40;

/** Trims a string field and collapses an empty one to `undefined`. */
export const trimOptional = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Validates an ISO 6346 container number, check digit included.
 *
 * The check digit is the point. A pattern match accepts `MSCU1234560` as readily as
 * `MSCU1234565`, and only one of those is a container — the eleventh character exists
 * precisely so a number copied off a steel door can be checked before it becomes a row.
 */
export function IsContainerNumber(options?: ValidationOptions) {
  return function (target: object, propertyName: string) {
    registerDecorator({
      name: "isContainerNumber",
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => typeof value === "string" && isValidContainerNumber(value),
        defaultMessage: () =>
          "containerNumber must be a valid ISO 6346 number (4 letters, 6 digits, and a matching check digit)",
      },
    });
  };
}

export class CreateContainerDto {
  /**
   * Normalized at the edge — uppercased, separators stripped — so no query downstream has
   * to remember that `mscu 123456-5` is the same box as `MSCU1234565`.
   */
  @Transform(({ value }) => (typeof value === "string" ? normalizeContainerNumber(value) : value))
  @IsContainerNumber()
  containerNumber!: string;

  @IsIn(CONTAINER_TYPES)
  type!: (typeof CONTAINER_TYPES)[number];

  // The console sends JSON numbers, and the global ValidationPipe runs with implicit
  // conversion off, so this arrives as a number or fails.
  @IsIn(CONTAINER_SIZES_FT)
  sizeFt!: (typeof CONTAINER_SIZES_FT)[number];

  @IsInt()
  @Min(500)
  @Max(MAX_TARE_KG)
  tareWeightKg!: number;

  @IsInt()
  @Min(1_000)
  @Max(MAX_GROSS_KG)
  maxGrossWeightKg!: number;

  // Absent means "leave it at the column default" rather than a value the client guessed:
  // a new box is `available` and `cargo_worthy` unless someone says otherwise.
  @IsIn(CONTAINER_STATUSES)
  @IsOptional()
  status?: (typeof CONTAINER_STATUSES)[number];

  @IsIn(CONTAINER_CONDITIONS)
  @IsOptional()
  condition?: (typeof CONTAINER_CONDITIONS)[number];

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(ISO_TYPE_CODE_PATTERN, { message: "isoTypeCode must be four characters, e.g. 22G1" })
  @IsOptional()
  isoTypeCode?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(200)
  @IsOptional()
  cubicCapacityM3?: number;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(OPERATOR_MAX)
  @IsOptional()
  operator?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(UNLOCODE_PATTERN, { message: "unlocode must be a 5-character UN/LOCODE, e.g. EGALY" })
  @IsOptional()
  unlocode?: string;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(DEPOT_MAX)
  @IsOptional()
  depot?: string;

  // Date-only strings, matching the columns: a build month and a survey deadline have no
  // time of day, and accepting one would invite a timezone to shift the day.
  @IsDateString({ strict: true, strictSeparator: true })
  @IsOptional()
  manufacturedOn?: string;

  @IsDateString({ strict: true, strictSeparator: true })
  @IsOptional()
  nextInspectionOn?: string;

  /**
   * Only meaningful on a reefer. The service rejects it on any other type rather than
   * storing a setpoint nothing will ever act on — a column that quietly holds a
   * meaningless value is how a fleet report ends up claiming a dry box runs at -18°C.
   */
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(MIN_SETPOINT_C)
  @Max(MAX_SETPOINT_C)
  @IsOptional()
  reeferSetpointC?: number;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(NOTES_MAX)
  @IsOptional()
  notes?: string;

  /** The console account responsible for the box; the service checks that it exists. */
  @IsUUID("4")
  @IsOptional()
  assignedToId?: string;
}
