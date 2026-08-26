"use client";

import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  PACKING_TYPES,
  SPECIAL_PACKING,
  STANDARD_TARE_KG,
  WASTE_CLASSIFICATIONS,
  WEEE_CATEGORIES,
} from "@repo/goods-in";
import { Button } from "@repo/ui/components/button";
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
import { Textarea } from "@repo/ui/components/textarea";

import type { PalletFormInput, PalletFormValues } from "../../_lib/schemas";
import type {
  CreatePalletPayload,
  DeliveryDetail,
  Pallet,
  UpdatePalletPayload,
} from "~/services/deliveries/types";
import { useCan } from "~/components/providers/ability-provider";
import { getApiErrorMessage } from "~/lib/axios";
import { useAddPallet, useUpdatePallet } from "~/services/deliveries/use-pallets";
import { useUsers } from "~/services/users/use-users";
import { createPalletFormSchema, NOT_SET, SELF } from "../../_lib/schemas";

/** Every console account fits in one select; there is no paging inside a dialog. */
const WORKER_LIMIT = 100;

interface PalletFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: DeliveryDetail;
  /** The pallet being edited; absent means a new line is being weighed in. */
  pallet?: Pallet | null;
}

function emptyValues(): PalletFormInput {
  return {
    packing: "eur",
    material: "",
    grossWeightKg: "",
    tareKg: "",
    weeeCategory: NOT_SET,
    quantityPcs: "",
    classification: NOT_SET,
    notice: "",
    workerId: SELF,
  };
}

/**
 * One line of the form, as the scale station enters it.
 *
 * The legend the paper printed at the bottom is behavior here: choosing a packing
 * shows its standard tare and the live net, and only `special` unlocks a tare input
 * at all — so the wrong tare is not a mistake anyone can make, it is a field that
 * does not exist.
 */
export function PalletFormDialog({ open, onOpenChange, delivery, pallet }: PalletFormDialogProps) {
  const t = useTranslations("GoodsIn.palletForm");
  const tp = useTranslations("GoodsIn.packing");
  const tcl = useTranslations("GoodsIn.classification");
  const tw = useTranslations("GoodsIn.weee");
  const tv = useTranslations("GoodsIn.validation");
  const format = useFormatter();

  const isEdit = Boolean(pallet);
  const addPallet = useAddPallet();
  const updatePallet = useUpdatePallet();

  // Recording a colleague's check is only offered to someone who may see accounts;
  // everyone else records under their own name, which is also the API's default.
  const canReadUsers = useCan("read", "User");
  const workers = useUsers({ skip: 0, take: WORKER_LIMIT });

  const schema = useMemo(
    () =>
      createPalletFormSchema({
        materialRequired: tv("materialRequired"),
        grossRange: tv("grossRange"),
        tareRange: tv("tareRange"),
        tareRequired: tv("tareRequired"),
        netPositive: tv("netPositive"),
        quantityRange: tv("quantityRange"),
        noticeMax: tv("noticeMax"),
      }),
    [tv],
  );

  // Three generics — the schema transforms; see the container form for the failure mode.
  const form = useForm<PalletFormInput, unknown, PalletFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(),
  });

  const { reset } = form;
  useEffect(() => {
    if (!open) return;

    if (!pallet) {
      reset(emptyValues());
      return;
    }

    reset({
      packing: pallet.packing,
      material: pallet.material,
      grossWeightKg: String(pallet.grossWeightKg),
      tareKg: pallet.packing === SPECIAL_PACKING ? String(pallet.tareKg) : "",
      weeeCategory: pallet.weeeCategory === null ? NOT_SET : String(pallet.weeeCategory),
      quantityPcs: pallet.quantityPcs === null ? "" : String(pallet.quantityPcs),
      classification: pallet.classification ?? NOT_SET,
      notice: pallet.notice ?? "",
      workerId: pallet.workerId,
    });
  }, [open, pallet, reset]);

  const packing = form.watch("packing");
  const isSpecial = packing === SPECIAL_PACKING;
  const standardTare = STANDARD_TARE_KG[packing];

  // The live arithmetic the paper form asked staff to do by hand.
  const gross = Number(form.watch("grossWeightKg"));
  const tare = isSpecial ? Number(form.watch("tareKg")) : (standardTare ?? 0);
  const net = Number.isFinite(gross) && Number.isFinite(tare) ? gross - tare : 0;

  async function onSubmit(values: PalletFormValues) {
    const isSpecialFinal = values.packing === SPECIAL_PACKING;

    try {
      if (pallet) {
        const patch: UpdatePalletPayload = {};
        if (values.packing !== pallet.packing) patch.packing = values.packing;
        if (values.material !== pallet.material) patch.material = values.material;
        if (values.grossWeightKg !== pallet.grossWeightKg) {
          patch.grossWeightKg = values.grossWeightKg;
        }
        // The tare is only the client's to send for `special` — anything else is the
        // server's standard, and sending one would be refused.
        if (
          isSpecialFinal &&
          values.tareKg !== undefined &&
          (pallet.packing !== SPECIAL_PACKING || values.tareKg !== pallet.tareKg)
        ) {
          patch.tareKg = values.tareKg;
        }
        if ((values.weeeCategory ?? null) !== pallet.weeeCategory) {
          patch.weeeCategory = values.weeeCategory ?? null;
        }
        if ((values.quantityPcs ?? null) !== pallet.quantityPcs) {
          patch.quantityPcs = values.quantityPcs ?? null;
        }
        if ((values.classification ?? null) !== pallet.classification) {
          patch.classification = values.classification ?? null;
        }
        if ((values.notice ?? null) !== pallet.notice) patch.notice = values.notice ?? null;
        if (values.workerId !== SELF && values.workerId !== pallet.workerId) {
          patch.workerId = values.workerId;
        }

        const updated = await updatePallet.mutateAsync({
          deliveryId: delivery.id,
          palletId: pallet.id,
          payload: patch,
        });
        toast.success(t("editSuccess", { label: updated.palletLabel }));
      } else {
        const created = await addPallet.mutateAsync({
          deliveryId: delivery.id,
          payload: {
            packing: values.packing,
            material: values.material,
            grossWeightKg: values.grossWeightKg,
            ...(isSpecialFinal ? { tareKg: values.tareKg } : {}),
            weeeCategory: values.weeeCategory,
            quantityPcs: values.quantityPcs,
            classification: values.classification,
            notice: values.notice,
            ...(values.workerId !== SELF ? { workerId: values.workerId } : {}),
          } satisfies CreatePalletPayload,
        });
        toast.success(t("createSuccess", { label: created.palletLabel }));
      }

      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editTitle", { label: pallet?.palletLabel ?? "" }) : t("createTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="packing"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("packing")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PACKING_TYPES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {tp(value)}
                            {STANDARD_TARE_KG[value] !== null
                              ? ` · ${format.number(STANDARD_TARE_KG[value]!)} kg`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {isSpecial
                        ? t("packingSpecialHint")
                        : t("packingHint", { tare: format.number(standardTare ?? 0) })}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="grossWeightKg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("gross")}</FormLabel>
                    <FormControl>
                      <Input type="number" dir="ltr" inputMode="numeric" autoFocus {...field} />
                    </FormControl>
                    <FormDescription>{t("grossHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Only special packing has a tare to type — it is weighed individually. */}
              {isSpecial ? (
                <FormField
                  control={form.control}
                  name="tareKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("tare")}</FormLabel>
                      <FormControl>
                        <Input type="number" dir="ltr" inputMode="numeric" {...field} />
                      </FormControl>
                      <FormDescription>{t("tareHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="quantityPcs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("quantity")}</FormLabel>
                    <FormControl>
                      <Input type="number" dir="ltr" inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* The arithmetic the paper asked for, done live where a typo is visible. */}
            <p className="text-muted-foreground text-sm">
              {t("netPreview", { weight: format.number(net) })}
            </p>

            <FormField
              control={form.control}
              name="material"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("material")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("materialPlaceholder")} autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="weeeCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("weeeCategory")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NOT_SET}>{t("weeeUnknown")}</SelectItem>
                        {WEEE_CATEGORIES.map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {tw(String(value) as "1")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{t("weeeHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="classification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("classification")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NOT_SET}>{t("classificationOpen")}</SelectItem>
                        {WASTE_CLASSIFICATIONS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {tcl(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Open is allowed on a draft; the sign-off is what requires it. */}
                    <FormDescription>{t("classificationHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {canReadUsers ? (
                <FormField
                  control={form.control}
                  name="workerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("worker")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {!isEdit ? <SelectItem value={SELF}>{t("workerSelf")}</SelectItem> : null}
                          {(workers.data?.users ?? []).map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name ?? user.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t("workerHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>

            <FormField
              control={form.control}
              name="notice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("notice")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder={t("noticePlaceholder")} {...field} />
                  </FormControl>
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
