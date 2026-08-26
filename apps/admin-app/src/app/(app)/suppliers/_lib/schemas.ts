import { z } from "zod";

/** Kept in step with the backend's `CreateSupplierDto`. */
export const SUPPLIER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;
export const SUPPLIER_NAME_MAX = 160;
export const SUPPLIER_NOTES_MAX = 2_000;

/** The already-translated strings the schema needs. */
export interface SupplierFormMessages {
  code: string;
  name: string;
  notesMax: string;
}

const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value.length > 0 ? value : undefined));

/**
 * Mirrors the backend DTO: the code is normalized to uppercase before the pattern so
 * `s014` is accepted as `S014` rather than bounced for its case.
 */
export function createSupplierFormSchema(messages: SupplierFormMessages) {
  return z.object({
    code: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .refine((value) => SUPPLIER_CODE_PATTERN.test(value), { error: messages.code }),
    name: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => value.length > 0 && value.length <= SUPPLIER_NAME_MAX, {
        error: messages.name,
      }),
    notes: optionalText.refine((value) => (value?.length ?? 0) <= SUPPLIER_NOTES_MAX, {
      error: messages.notesMax,
    }),
  });
}

export type SupplierFormInput = z.input<ReturnType<typeof createSupplierFormSchema>>;
export type SupplierFormValues = z.output<ReturnType<typeof createSupplierFormSchema>>;
