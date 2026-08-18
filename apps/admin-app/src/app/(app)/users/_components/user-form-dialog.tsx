"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { Label } from "@repo/ui/components/label";

import type { UserFormInput } from "../_lib/schemas";
import type { UpdateUserPayload, User } from "~/services/users/types";
import { useCan } from "~/components/providers/ability-provider";
import { getApiErrorMessage, isConflict } from "~/lib/axios";
import { useRoles } from "~/services/roles/use-roles";
import { useCreateUser } from "~/services/users/use-create-user";
import { useUpdateUser } from "~/services/users/use-update-user";
import { createUserFormSchema, PASSWORD_MIN } from "../_lib/schemas";

/** Every role an install has fits in this list; there is no paging inside a dialog. */
const ROLE_LIMIT = 100;

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
 *
 * Roles appear only on the create path. Changing an existing user's roles is its own
 * request with its own refusals — the last administrator, your own account — and it
 * belongs beside the effective-permissions view on `/users/[id]`, not behind a save
 * button shared with a rename. Creating an account has neither problem: nobody holds a
 * role yet, and the account cannot be your own.
 */
export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const t = useTranslations("Users.form");
  const tv = useTranslations("Users.validation");

  const isEdit = Boolean(user);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  // Only asked for on create, and only from someone allowed to see roles. Anyone else
  // creates the account and an operator with the right grants it its roles afterwards.
  const canReadRoles = useCan("read", "Role");
  const roleOptions = useRoles(
    useMemo(() => ({ skip: 0, take: ROLE_LIMIT }), []),
    { enabled: canReadRoles && open && !isEdit },
  );
  const [roleIds, setRoleIds] = useState<string[]>([]);

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
    defaultValues: { name: "", email: "", password: "" },
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
    });
    // Empty rather than a guessed default: leaving every box unchecked means "whatever the
    // backend considers default", which is one fewer decision to get wrong here.
    setRoleIds([]);
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
        if (values.password) payload.password = values.password;

        const updated = await updateUser.mutateAsync({ id: user.id, payload });
        toast.success(t("editSuccess", { name: displayName(updated) }));
      } else {
        const created = await createUser.mutateAsync({
          email: values.email,
          password: values.password,
          name: values.name.trim() || undefined,
          // Omitted, not `[]`, when nothing was picked: an empty array would mean "an
          // account that can do nothing", which is a decision, not a default.
          roleIds: roleIds.length > 0 ? roleIds : undefined,
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

            {!isEdit && canReadRoles ? (
              <div className="flex flex-col gap-2">
                <FormLabel>{t("roles")}</FormLabel>
                {roleOptions.data?.roles.length ? (
                  roleOptions.data.roles.map((role) => (
                    <div key={role.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`new-user-role-${role.id}`}
                        checked={roleIds.includes(role.id)}
                        onCheckedChange={(checked) =>
                          setRoleIds((current) =>
                            checked === true
                              ? [...current, role.id]
                              : current.filter((id) => id !== role.id),
                          )
                        }
                      />
                      <Label htmlFor={`new-user-role-${role.id}`} className="font-normal">
                        {role.name}
                      </Label>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">{t("rolesLoading")}</p>
                )}
                <FormDescription>{t("rolesHint")}</FormDescription>
              </div>
            ) : null}

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
