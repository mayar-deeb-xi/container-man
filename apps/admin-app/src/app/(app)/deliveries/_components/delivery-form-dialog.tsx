"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { GoodsDocType } from "@repo/goods-in";
import { GOODS_DOC_TYPES } from "@repo/goods-in";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import type { DeliveryFormInput, DeliveryFormValues } from "../_lib/schemas";
import type { Delivery, UpdateDeliveryPayload } from "~/services/deliveries/types";
import { useFieldAccess } from "~/components/providers/ability-provider";
import { getApiErrorMessage } from "~/lib/axios";
import { useCreateDelivery } from "~/services/deliveries/use-create-delivery";
import { useSupplierOptions } from "~/services/deliveries/use-supplier-options";
import { useUpdateDelivery } from "~/services/deliveries/use-update-delivery";
import { todayIso } from "../../containers/_lib/format";
import { createDeliveryFormSchema, NOT_SET } from "../_lib/schemas";

interface DeliveryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The delivery whose header is being edited; absent means this records a new one. */
  delivery?: Delivery | null;
}

function emptyValues(): DeliveryFormInput {
  // The lorry being recorded is usually the one in the yard — today is the right guess.
  return { supplierId: NOT_SET, deliveredOn: todayIso(), lotNo: "", documents: [] };
}

/**
 * The header form — supplier, date, lot and the document checklist.
 *
 * What the paper form solved with a legend ("Documents attached: 1, 3, 5") is a row of
 * named checkboxes; what it solved with a composed Delivery ID does not appear at all,
 * because the reference is the system's to assign. A create navigates straight to the
 * new record, where the pallets are entered.
 */
export function DeliveryFormDialog({ open, onOpenChange, delivery }: DeliveryFormDialogProps) {
  const t = useTranslations("GoodsIn.form");
  const tdoc = useTranslations("GoodsIn.docTypes");
  const tv = useTranslations("GoodsIn.validation");
  const router = useRouter();

  const isEdit = Boolean(delivery);
  const createDelivery = useCreateDelivery();
  const updateDelivery = useUpdateDelivery();
  const supplierOptions = useSupplierOptions(open);
  const canWriteField = useFieldAccess("Delivery", delivery);

  const schema = useMemo(
    () =>
      createDeliveryFormSchema({
        supplierRequired: tv("supplierRequired"),
        dateInvalid: tv("dateInvalid"),
        lotNoMax: tv("lotNoMax"),
      }),
    [tv],
  );

  // Three generics — the schema transforms; see the container form for the failure mode.
  const form = useForm<DeliveryFormInput, unknown, DeliveryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(),
  });

  const { reset } = form;
  useEffect(() => {
    if (!open) return;

    if (!delivery) {
      reset(emptyValues());
      return;
    }

    reset({
      supplierId: delivery.supplierId,
      deliveredOn: delivery.deliveredOn,
      lotNo: delivery.lotNo ?? "",
      documents: delivery.documents,
    });
  }, [open, delivery, reset]);

  async function onSubmit(values: DeliveryFormValues) {
    try {
      if (delivery) {
        const patch: UpdateDeliveryPayload = {};
        if (values.supplierId !== delivery.supplierId) patch.supplierId = values.supplierId;
        if (values.deliveredOn !== delivery.deliveredOn) patch.deliveredOn = values.deliveredOn;
        if ((values.lotNo ?? null) !== delivery.lotNo) patch.lotNo = values.lotNo ?? null;
        if (!sameDocuments(values.documents, delivery.documents)) {
          patch.documents = values.documents;
        }

        await updateDelivery.mutateAsync({ id: delivery.id, payload: patch });
        toast.success(t("editSuccess", { reference: delivery.reference }));
        onOpenChange(false);
      } else {
        const created = await createDelivery.mutateAsync({
          supplierId: values.supplierId,
          deliveredOn: values.deliveredOn,
          lotNo: values.lotNo,
          documents: values.documents,
        });
        toast.success(t("createSuccess", { reference: created.reference }));
        onOpenChange(false);
        // Straight to the record: the header was the small half, the pallets are next.
        router.push(`/deliveries/${created.id}`);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="supplierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("supplier")}</FormLabel>
                  <Select
                    value={field.value}
                    disabled={!canWriteField("supplierId")}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t("supplierPlaceholder")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(supplierOptions.data ?? []).map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Codes only, on purpose: this is the paper form's confidentiality rule.
                      Which company a code belongs to lives behind its own permission. */}
                  <FormDescription>{t("supplierHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="deliveredOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("deliveredOn")}</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        dir="ltr"
                        disabled={!canWriteField("deliveredOn")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lotNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("lotNo")}</FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        placeholder={t("lotNoPlaceholder")}
                        disabled={!canWriteField("lotNo")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="documents"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("documents")}</FormLabel>
                  <FormDescription>{t("documentsHint")}</FormDescription>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {GOODS_DOC_TYPES.map((docType) => {
                      const checked = field.value.includes(docType);
                      return (
                        <label
                          key={docType}
                          className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            disabled={!canWriteField("documents")}
                            onCheckedChange={(next) =>
                              field.onChange(
                                next === true
                                  ? [...field.value, docType]
                                  : field.value.filter((value: GoodsDocType) => value !== docType),
                              )
                            }
                          />
                          {tdoc(docType)}
                        </label>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    {t("submitting")}
                  </>
                ) : isEdit ? (
                  t("submitEdit")
                ) : (
                  t("submitCreate")
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Order-insensitive: the checklist is a set, and the checkbox order is presentation. */
function sameDocuments(next: readonly GoodsDocType[], current: readonly GoodsDocType[]): boolean {
  return next.length === current.length && next.every((value) => current.includes(value));
}
