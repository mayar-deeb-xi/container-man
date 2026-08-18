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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import type { UserFormInput } from "../_lib/schemas";
import type { UpdateUserPayload, User } from "~/services/users/types";
import { getApiErrorMessage, isConflict } from "~/lib/axios";
import { useCreateUser } from "~/services/users/use-create-user";
import { useUpdateUser } from "~/services/users/use-update-user";
import { createUserFormSchema, PASSWORD_MIN } from "../_lib/schemas";

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user being edited; absent means this is a create. */
  user?: User | null;
}

/** What to call a user in a sentence — the name if there is one, else the email. */
export function displayName(user: Pick<User, "name" | "email">): string {
  return user.name?.trim() || user.email;
}

/**
 * One dialog for both create and edit.
 *
 * They differ in three details — the title, whether a password is required, and
 * whether the submit is a POST or a PATCH — which is far less than the two copies
 * of a four-field form it would take to keep them apart.
 */
export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const t = useTranslations("Users.form");
  const tv = useTranslations("Users.validation");
  const tr = useTranslations("Users.roles");

  const isEdit = Boolean(user);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  // Rebuilt when the language changes so validation errors are translated too.
  const schema = useMemo(
    () =>
      createUserFormSchema(
        {
          emailInvalid: tv("emailInvalid"),
          passwordMin: tv("passwordMin", { min: PASSWORD_MIN }),
          passwordMax: tv("passwordMax"),
          nameMax: tv("nameMax"),
        },
        { requirePassword: !isEdit },
      ),
    [tv, isEdit],
  );

  const form = useForm<UserFormInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", role: "user" },
  });

  // The dialog is mounted once and reused, so the fields have to be re-seeded
  // whenever it opens — otherwise it would show whoever was edited last.
  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    reset({
      name: user?.name ?? "",
      email: user?.email ?? "",
      // Never pre-filled, on either path: on edit it means "set a new password",
      // and there is nothing to pre-fill it with anyway.
      password: "",
      role: user?.role ?? "user",
    });
  }, [open, user, reset]);

  async function onSubmit(values: UserFormInput) {
    try {
      if (user) {
        // Only what actually changed: a PATCH that echoes every field would
        // rewrite the password hash on every save and sign the user out for it.
        const payload: UpdateUserPayload = {};
        const name = values.name.trim();

        if (values.email !== user.email) payload.email = values.email;
        if (name !== (user.name ?? "")) payload.name = name || null;
        if (values.role !== user.role) payload.role = values.role;
        if (values.password) payload.password = values.password;

        const updated = await updateUser.mutateAsync({ id: user.id, payload });
        toast.success(t("editSuccess", { name: displayName(updated) }));
      } else {
        const created = await createUser.mutateAsync({
          email: values.email,
          password: values.password,
          name: values.name.trim() || undefined,
          role: values.role,
        });
        toast.success(t("createSuccess", { name: displayName(created) }));
      }

      onOpenChange(false);
    } catch (error) {
      if (isConflict(error)) {
        // The only uniqueness constraint on this form is the email, so put the
        // message on that field rather than in a toast the user has to translate
        // back into "which box do I fix?".
        form.setError("email", { message: t("emailTaken") });
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("name")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("namePlaceholder")} autoComplete="off" {...field} />
                  </FormControl>
                  <FormDescription>{t("nameOptional")}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("email")}</FormLabel>
                  <FormControl>
                    {/* An email is not localised text, so it stays LTR even in a
                        right-to-left layout — the label beside it still flips. */}
                    <Input
                      type="email"
                      dir="ltr"
                      placeholder={t("emailPlaceholder")}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEdit ? t("newPassword") : t("password")}</FormLabel>
                  <FormControl>
                    <Input type="password" dir="ltr" autoComplete="new-password" {...field} />
                  </FormControl>
                  {isEdit ? <FormDescription>{t("passwordHint")}</FormDescription> : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("role")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="user">{tr("user")}</SelectItem>
                      <SelectItem value="admin">{tr("admin")}</SelectItem>
                    </SelectContent>
                  </Select>
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
