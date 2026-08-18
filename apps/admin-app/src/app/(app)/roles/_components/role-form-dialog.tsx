"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { WRITABLE_FIELDS } from "@repo/access";
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

import type { RoleFormInput } from "../_lib/schemas";
import type { Role, UpdateRolePayload } from "~/services/roles/types";
import { useFieldAccess } from "~/components/providers/ability-provider";
import { getApiErrorMessage, isConflict } from "~/lib/axios";
import { useCreateRole } from "~/services/roles/use-create-role";
import { useUpdateRole } from "~/services/roles/use-update-role";
import { createRoleFormSchema, suggestKey } from "../_lib/schemas";

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The role being edited; absent means this is a create. */
  role?: Role | null;
}

/**
 * One dialog for both create and edit.
 *
 * It covers the role's identity only — name, key, description. What the role *grants*
 * is a page of its own (`/roles/[id]`), because a matrix of every action against every
 * subject does not belong in a modal, and because creating a role and deciding what it
 * can do are usually two sittings.
 */
export function RoleFormDialog({ open, onOpenChange, role }: RoleFormDialogProps) {
  const t = useTranslations("Roles.form");
  const tv = useTranslations("Roles.validation");
  const tcommon = useTranslations("Common");

  const isEdit = Boolean(role);
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  /**
   * Which of this role's identity fields the caller may write.
   *
   * The interesting exclusion is not on this form: `permissions` is a field of a role too,
   * and the matrix on `/roles/[id]` is what it gates. Here it is only name, key and
   * description — the three a rule may withhold while still allowing the rename.
   */
  const canWriteField = useFieldAccess("Role", role);
  const restrictedCount = WRITABLE_FIELDS.Role.filter(
    (field) => field !== "permissions" && !canWriteField(field),
  ).length;

  // Rebuilt when the language changes so validation errors are translated too.
  const schema = useMemo(
    () =>
      createRoleFormSchema({
        keyRequired: tv("keyRequired"),
        keyPattern: tv("keyPattern"),
        keyMax: tv("keyMax"),
        nameRequired: tv("nameRequired"),
        nameMax: tv("nameMax"),
        descriptionMax: tv("descriptionMax"),
      }),
    [tv],
  );

  const form = useForm<RoleFormInput>({
    resolver: zodResolver(schema),
    defaultValues: { key: "", name: "", description: "" },
  });

  /**
   * Whether the key field is still following the name.
   *
   * A key is derived from the name until someone edits it, and then it is theirs. The
   * alternative — regenerating on every keystroke — would silently overwrite a
   * deliberate key, and on an existing role would propose renaming the one thing that
   * is supposed to be stable.
   */
  const [isKeyLinked, setKeyLinked] = useState(!isEdit);

  // The dialog is mounted once and reused, so the fields have to be re-seeded whenever
  // it opens — otherwise it would show whichever role was edited last.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset({ key: role?.key ?? "", name: role?.name ?? "", description: role?.description ?? "" });
    setKeyLinked(!role);
  }, [open, role, reset]);

  async function onSubmit(values: RoleFormInput) {
    try {
      if (role) {
        // Only what actually changed: a PATCH that echoes every field would move
        // `updated_at` on a save that changed nothing.
        const payload: UpdateRolePayload = {};
        const description = values.description.trim();

        if (values.name !== role.name) payload.name = values.name;
        if (description !== (role.description ?? "")) payload.description = description || null;
        // A system role's key is refused by the API, and the field is disabled for one
        // here — so this only ever fires for a role whose key an operator may change.
        if (!role.isSystem && values.key !== role.key) payload.key = values.key;

        const updated = await updateRole.mutateAsync({ id: role.id, payload });
        toast.success(t("editSuccess", { name: updated.name }));
      } else {
        const created = await createRole.mutateAsync({
          key: values.key,
          name: values.name,
          description: values.description.trim() || undefined,
        });
        toast.success(t("createSuccess", { name: created.name }));
      }

      onOpenChange(false);
    } catch (error) {
      if (isConflict(error)) {
        // The only uniqueness constraint on this form is the key, so put the message on
        // that field rather than in a toast the user has to translate back into "which
        // box do I fix?".
        form.setError("key", { message: t("keyTaken") });
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
            {restrictedCount > 0 ? (
              <p className="bg-muted/50 text-muted-foreground rounded-lg border p-3 text-sm">
                {tcommon("fieldsRestricted")}
              </p>
            ) : null}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("namePlaceholder")}
                      autoComplete="off"
                      disabled={!canWriteField("name")}
                      {...field}
                      onChange={(event) => {
                        field.onChange(event);
                        if (isKeyLinked) {
                          form.setValue("key", suggestKey(event.target.value), {
                            shouldValidate: form.formState.isSubmitted,
                          });
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("key")}</FormLabel>
                  <FormControl>
                    {/* A key is an identifier, so it stays LTR even in a right-to-left
                        layout — the label beside it still flips. */}
                    <Input
                      dir="ltr"
                      placeholder={t("keyPlaceholder")}
                      autoComplete="off"
                      // The one field a system role cannot change: code refers to `admin`
                      // by key, so renaming it would break the install silently. A rule
                      // narrowed to the other fields disables it for an ordinary role too.
                      disabled={role?.isSystem || !canWriteField("key")}
                      {...field}
                      onChange={(event) => {
                        setKeyLinked(false);
                        field.onChange(event);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {role?.isSystem ? t("keySystemHint") : t("keyHint")}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("description")}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder={t("descriptionPlaceholder")}
                      disabled={!canWriteField("description")}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t("descriptionOptional")}</FormDescription>
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
