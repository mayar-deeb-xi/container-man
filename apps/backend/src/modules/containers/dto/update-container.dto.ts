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
} from "class-validator";

import type { WritableKeys } from "@repo/access";
import {
  CONTAINER_CONDITIONS,
  CONTAINER_SIZES_FT,
  CONTAINER_STATUSES,
  CONTAINER_TYPES,
  ISO_TYPE_CODE_PATTERN,
  MAX_GROSS_KG,
  MAX_TARE_KG,
  normalizeContainerNumber,
  UNLOCODE_PATTERN,
} from "@repo/shipping";

import {
  DEPOT_MAX,
  IsContainerNumber,
  MAX_SETPOINT_C,
  MIN_SETPOINT_C,
  NOTES_MAX,
  OPERATOR_MAX,
  trimOptional,
} from "./create-container.dto";

/**
 * A PATCH: an absent key leaves that column alone, and an explicit `null` clears it.
 *
 * The nullable fields are the ones an operator can legitimately un-know — a depot the box
 * has left, a setpoint that no longer applies, an assignment being handed back. The
 * required ones (number, type, size, the two plate weights) have no meaningful empty
 * state: a container without a tare weight is a record nobody can act on.
 */
export class UpdateContainerDto {
  @Transform(({ value }) => (typeof value === "string" ? normalizeContainerNumber(value) : value))
  @IsContainerNumber()
  @IsOptional()
  containerNumber?: string;

  @IsIn(CONTAINER_TYPES)
  @IsOptional()
  type?: (typeof CONTAINER_TYPES)[number];

  @IsIn(CONTAINER_SIZES_FT)
  @IsOptional()
  sizeFt?: (typeof CONTAINER_SIZES_FT)[number];

  @IsInt()
  @Min(500)
  @Max(MAX_TARE_KG)
  @IsOptional()
  tareWeightKg?: number;

  @IsInt()
  @Min(1_000)
  @Max(MAX_GROSS_KG)
  @IsOptional()
  maxGrossWeightKg?: number;

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
  isoTypeCode?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(200)
  @IsOptional()
  cubicCapacityM3?: number | null;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(OPERATOR_MAX)
  @IsOptional()
  operator?: string | null;

  @Transform(({ value }) => (typeof value === "string" ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(UNLOCODE_PATTERN, { message: "unlocode must be a 5-character UN/LOCODE, e.g. EGALY" })
  @IsOptional()
  unlocode?: string | null;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(DEPOT_MAX)
  @IsOptional()
  depot?: string | null;

  @IsDateString({ strict: true, strictSeparator: true })
  @IsOptional()
  manufacturedOn?: string | null;

  @IsDateString({ strict: true, strictSeparator: true })
  @IsOptional()
  nextInspectionOn?: string | null;

  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(MIN_SETPOINT_C)
  @Max(MAX_SETPOINT_C)
  @IsOptional()
  reeferSetpointC?: number | null;

  @Transform(trimOptional)
  @IsString()
  @MaxLength(NOTES_MAX)
  @IsOptional()
  notes?: string | null;

  @IsUUID("4")
  @IsOptional()
  assignedToId?: string | null;
}

/**
 * Every key of this PATCH is nameable in a rule's `fields`, checked at compile time.
 *
 * A key missing from `WRITABLE_FIELDS.Container` would be a column no rule can mention:
 * a role narrowed to every *other* field would leave this one writable, and nothing would
 * say so. Adding a field here without registering it does not build.
 */
export type ContainerPatchField = WritableKeys<"Container", keyof UpdateContainerDto>;
