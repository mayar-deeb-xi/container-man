"use client";

import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Textarea } from "@repo/ui/components/textarea";

import type { SupplierFormInput, SupplierFormValues } from "../_lib/schemas";
import type { Supplier, UpdateSupplierPayload } from "~/services/suppliers/types";
import { useFieldAccess } from "~/components/providers/ability-provider";
import { getApiErrorMessage, isConflict } from "~/lib/axios";
import { useCreateSupplier } from "~/services/suppliers/use-create-supplier";
import { useUpdateSupplier } from "~/services/suppliers/use-update-supplier";
import { createSupplierFormSchema } from "../_lib/schemas";

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The supplier being edited; absent means this is a create. */
  supplier?: Supplier | null;
}

function emptyValues(): SupplierFormInput {
  return { code: "", name: "", notes: "" };
}

/** One dialog for both create and edit — three fields, no sections needed. */
export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  const t = useTranslations("Suppliers.form");
  const tv = useTranslations("Suppliers.validation");

  const isEdit = Boolean(supplier);
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const canWriteField = useFieldAccess("Supplier", supplier);

  const schema = useMemo(
    () =>
      createSupplierFormSchema({
        code: tv("code"),
        name: tv("name"),
        notesMax: tv("notesMax"),
      }),
    [tv],
  );

  // Three generics — the schema transforms; see the container form for the failure mode.
  const form = useForm<SupplierFormInput, unknown, SupplierFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(),
  });

  const { reset } = form;
  useEffect(() => {
    if (!open) return;

    if (!supplier) {
      reset(emptyValues());
      return;
    }

    reset({ code: supplier.code, name: supplier.name, notes: supplier.notes ?? "" });
  }, [open, supplier, reset]);

  async function onSubmit(values: SupplierFormValues) {
    try {
      if (supplier) {
        const patch: UpdateSupplierPayload = {};
        if (values.code !== supplier.code) patch.code = values.code;
        if (values.name !== supplier.name) patch.name = values.name;
        if ((values.notes ?? null) !== supplier.notes) patch.notes = values.notes ?? null;

        const updated = await updateSupplier.mutateAsync({ id: supplier.id, payload: patch });
        toast.success(t("editSuccess", { code: updated.code }));
      } else {
        const created = await createSupplier.mutateAsync({
          code: values.code,
          name: values.name,
          notes: values.notes,
        });
        toast.success(t("createSuccess", { code: created.code }));
      }

      onOpenChange(false);
    } catch (error) {
      if (isConflict(error)) {
        form.setError("code", { message: t("codeTaken") });
        return;
      }
      toast.error(getApiErrorMessage(error, t("error")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("code")}</FormLabel>
                  <FormControl>
                    {/* An identifier — LTR and monospaced even in a right-to-left layout. */}
                    <Input
                      dir="ltr"
                      className="font-mono"
                      placeholder="S014"
                      autoComplete="off"
                      disabled={!canWriteField("code")}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t("codeHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("name")}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" disabled={!canWriteField("name")} {...field} />
                  </FormControl>
                  <FormDescription>{t("nameHint")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("notes")}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} disabled={!canWriteField("notes")} {...field} />
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
