import { z } from "zod";

import {
  GOODS_DOC_TYPES,
  MAX_PALLET_GROSS_KG,
  MAX_SPECIAL_TARE_KG,
  PACKING_TYPES,
  SPECIAL_PACKING,
  STANDARD_TARE_KG,
  WASTE_CLASSIFICATIONS,
  WEEE_CATEGORIES,
} from "@repo/goods-in";

/** Kept in step with the backend's DTOs. */
export const MATERIAL_MAX = 200;
export const NOTICE_MAX = 2_000;
export const LOT_NO_MAX = 80;
export const MAX_QUANTITY_PCS = 100_000;

/** Select sentinels — a Radix Select cannot hold an empty value. */
export const NOT_SET = "none";
/** The worker option meaning "whoever is signed in" — sent as no `workerId` at all. */
export const SELF = "self";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : undefined));

export interface DeliveryFormMessages {
  supplierRequired: string;
  dateInvalid: string;
  lotNoMax: string;
}

/** The header form — what the paper form's top box asked for, minus what the system assigns. */
export function createDeliveryFormSchema(messages: DeliveryFormMessages) {
  return z.object({
    supplierId: z.string().refine((value) => value !== NOT_SET && value.length > 0, {
      error: messages.supplierRequired,
    }),
    deliveredOn: z.string().refine((value) => DATE_PATTERN.test(value), {
      error: messages.dateInvalid,
    }),
    lotNo: optionalText.refine((value) => (value?.length ?? 0) <= LOT_NO_MAX, {
      error: messages.lotNoMax,
    }),
    documents: z.array(z.enum(GOODS_DOC_TYPES)),
  });
}

export type DeliveryFormInput = z.input<ReturnType<typeof createDeliveryFormSchema>>;
export type DeliveryFormValues = z.output<ReturnType<typeof createDeliveryFormSchema>>;

export interface PalletFormMessages {
  materialRequired: string;
  grossRange: string;
  tareRange: string;
  tareRequired: string;
  netPositive: string;
  quantityRange: string;
  noticeMax: string;
}

/**
 * One pallet, as the scale station enters it.
 *
 * The tare field only *means* anything for `special` packing — the standard tares are
 * the server's to apply, and the form does not even render the input otherwise. The
 * cross-field checks mirror the service: a special pallet needs its weighed tare, and
 * whatever tare applies must leave a positive net.
 */
export function createPalletFormSchema(messages: PalletFormMessages) {
  return z
    .object({
      packing: z.enum(PACKING_TYPES),
      material: z
        .string()
        .transform((value) => value.trim())
        .refine((value) => value.length > 0 && value.length <= MATERIAL_MAX, {
          error: messages.materialRequired,
        }),
      grossWeightKg: z
        .string()
        .transform((value) => Number(value))
        .refine(
          (value) => Number.isInteger(value) && value >= 1 && value <= MAX_PALLET_GROSS_KG,
          { error: messages.grossRange },
        ),
      tareKg: z
        .string()
        .transform((value) => value.trim())
        .transform((value) => (value.length > 0 ? Number(value) : undefined))
        .refine(
          (value) =>
            value === undefined ||
            (Number.isInteger(value) && value >= 0 && value <= MAX_SPECIAL_TARE_KG),
          { error: messages.tareRange },
        ),
      weeeCategory: z
        .string()
        .transform((value) => (value === NOT_SET ? undefined : Number(value)))
        .refine(
          (value): value is undefined | (typeof WEEE_CATEGORIES)[number] =>
            value === undefined || (WEEE_CATEGORIES as readonly number[]).includes(value),
        ),
      quantityPcs: z
        .string()
        .transform((value) => value.trim())
        .transform((value) => (value.length > 0 ? Number(value) : undefined))
        .refine(
          (value) =>
            value === undefined ||
            (Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY_PCS),
          { error: messages.quantityRange },
        ),
      classification: z
        .string()
        .transform((value) => (value === NOT_SET ? undefined : value))
        .refine(
          (value): value is undefined | (typeof WASTE_CLASSIFICATIONS)[number] =>
            value === undefined ||
            (WASTE_CLASSIFICATIONS as readonly string[]).includes(value),
        ),
      notice: optionalText.refine((value) => (value?.length ?? 0) <= NOTICE_MAX, {
        error: messages.noticeMax,
      }),
      /** `SELF` means "no workerId sent" — the API defaults to the signed-in account. */
      workerId: z.string(),
    })
    .refine((values) => values.packing !== SPECIAL_PACKING || values.tareKg !== undefined, {
      error: messages.tareRequired,
      path: ["tareKg"],
    })
    .refine(
      (values) => {
        // The tare the server will apply: the packing's standard, or the weighed one.
        const tare =
          values.packing === SPECIAL_PACKING
            ? (values.tareKg ?? 0)
            : (STANDARD_TARE_KG[values.packing] ?? 0);
        return values.grossWeightKg > tare;
      },
      { error: messages.netPositive, path: ["grossWeightKg"] },
    );
}

export type PalletFormInput = z.input<ReturnType<typeof createPalletFormSchema>>;
export type PalletFormValues = z.output<ReturnType<typeof createPalletFormSchema>>;
