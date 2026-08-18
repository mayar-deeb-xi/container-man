import { z } from "zod";

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

/** Kept in step with the backend's `CreateContainerDto`. */
export const NOTES_MAX = 2_000;
export const OPERATOR_MAX = 80;
export const DEPOT_MAX = 120;
export const MIN_SETPOINT_C = -40;
export const MAX_SETPOINT_C = 40;

/** The already-translated strings the schema needs. */
export interface ContainerFormMessages {
  numberInvalid: string;
  isoTypeCode: string;
  unlocode: string;
  tareRange: string;
  grossRange: string;
  payloadPositive: string;
  capacityRange: string;
  setpointRange: string;
  setpointReeferOnly: string;
  operatorMax: string;
  depotMax: string;
  notesMax: string;
  dateInvalid: string;
}

/** Empty string in, `undefined` out — a form field that was left alone. */
const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : undefined));

/**
 * A number field that may be left blank.
 *
 * The inputs are strings even when `type="number"`, so the schema is what turns `""` into
 * "not provided" and `"33.2"` into a number — and it has to happen before the range checks
 * or every empty optional field would fail as NaN.
 */
const optionalNumber = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? Number(value) : undefined));

/**
 * Builds the container form's schema from resolved messages.
 *
 * Mirrors the backend DTOs, including the ISO 6346 check digit — which is the one rule
 * worth having on the client: a mistyped digit is the most likely error in the whole form,
 * and finding out after a round trip is a worse experience than the duplication is a cost.
 * `@repo/shipping` is imported rather than copied so the two cannot drift.
 */
export function createContainerFormSchema(messages: ContainerFormMessages) {
  const isDateOrEmpty = (value: string | undefined) =>
    value === undefined || /^\d{4}-\d{2}-\d{2}$/.test(value);

  return (
    z
      .object({
        containerNumber: z
          .string()
          .transform(normalizeContainerNumber)
          .refine(isValidContainerNumber, { error: messages.numberInvalid }),
        type: z.enum(CONTAINER_TYPES),
        // The select yields a string; the API takes a number, and only these three exist.
        sizeFt: z
          .string()
          .transform((value) => Number(value))
          .refine((value): value is (typeof CONTAINER_SIZES_FT)[number] =>
            (CONTAINER_SIZES_FT as readonly number[]).includes(value),
          ),
        status: z.enum(CONTAINER_STATUSES),
        condition: z.enum(CONTAINER_CONDITIONS),
        tareWeightKg: z
          .string()
          .transform((value) => Number(value))
          .refine((value) => Number.isInteger(value) && value >= 500 && value <= MAX_TARE_KG, {
            error: messages.tareRange,
          }),
        maxGrossWeightKg: z
          .string()
          .transform((value) => Number(value))
          .refine((value) => Number.isInteger(value) && value >= 1_000 && value <= MAX_GROSS_KG, {
            error: messages.grossRange,
          }),
        isoTypeCode: optionalText.refine(
          (value) => value === undefined || ISO_TYPE_CODE_PATTERN.test(value.toUpperCase()),
          { error: messages.isoTypeCode },
        ),
        cubicCapacityM3: optionalNumber.refine(
          (value) => value === undefined || (value >= 1 && value <= 200),
          { error: messages.capacityRange },
        ),
        operator: optionalText.refine((value) => (value?.length ?? 0) <= OPERATOR_MAX, {
          error: messages.operatorMax,
        }),
        unlocode: optionalText.refine(
          (value) => value === undefined || UNLOCODE_PATTERN.test(value.toUpperCase()),
          { error: messages.unlocode },
        ),
        depot: optionalText.refine((value) => (value?.length ?? 0) <= DEPOT_MAX, {
          error: messages.depotMax,
        }),
        manufacturedOn: optionalText.refine(isDateOrEmpty, { error: messages.dateInvalid }),
        nextInspectionOn: optionalText.refine(isDateOrEmpty, { error: messages.dateInvalid }),
        reeferSetpointC: optionalNumber.refine(
          (value) => value === undefined || (value >= MIN_SETPOINT_C && value <= MAX_SETPOINT_C),
          { error: messages.setpointRange },
        ),
        notes: optionalText.refine((value) => (value?.length ?? 0) <= NOTES_MAX, {
          error: messages.notesMax,
        }),
        /** Empty string is the "nobody" option — a Radix Select cannot hold an empty value. */
        assignedToId: z.string(),
      })
      // Cross-field rules, which have to run after the fields are parsed. Both mirror a check
      // the service performs, so the form can explain them instead of relaying a 400.
      .refine((values) => values.maxGrossWeightKg > values.tareWeightKg, {
        error: messages.payloadPositive,
        path: ["maxGrossWeightKg"],
      })
      .refine((values) => values.reeferSetpointC === undefined || values.type === "reefer", {
        error: messages.setpointReeferOnly,
        path: ["reeferSetpointC"],
      })
  );
}

/** What the form's inputs hold — every field a string, as the DOM gives them. */
export type ContainerFormInput = z.input<ReturnType<typeof createContainerFormSchema>>;

/** What the schema produces — numbers parsed, blanks dropped. */
export type ContainerFormValues = z.output<ReturnType<typeof createContainerFormSchema>>;
