"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";

import type { LoginInput } from "../_lib/schemas";
import { getApiErrorMessage, isUnauthorized } from "~/lib/axios";
import { useLogin } from "~/services/auth/use-login";
import { createLoginSchema, PASSWORD_MIN } from "../_lib/schemas";

export function LoginForm() {
  const t = useTranslations("Login");
  const tv = useTranslations("Login.validation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();

  // Rebuilt when the language changes so validation errors are translated too.
  const schema = useMemo(
    () =>
      createLoginSchema({
        emailInvalid: tv("emailInvalid"),
        passwordMin: tv("passwordMin", { min: PASSWORD_MIN }),
        passwordMax: tv("passwordMax"),
      }),
    [tv],
  );

  const form = useForm<LoginInput>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    try {
      await login.mutateAsync(values);
      // Only follow `next` when it is a relative path — an absolute URL here
      // would turn the login page into an open redirect.
      const next = searchParams.get("next");
      const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      router.replace(destination);
    } catch (error) {
      if (isUnauthorized(error)) {
        // Surface credential failures on the form rather than as a toast, and
        // never say which of the two fields was wrong.
        form.setError("root", { message: t("invalidCredentials") });
        form.resetField("password");
        return;
      }
      toast.error(getApiErrorMessage(error, t("genericError")));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("email")}</FormLabel>
              <FormControl>
                {/* Credentials are never localised text, so they stay LTR even in
                    a right-to-left layout — the label beside them still flips. */}
                <Input
                  type="email"
                  dir="ltr"
                  placeholder={t("emailPlaceholder")}
                  autoComplete="email"
                  autoFocus
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
              <FormLabel>{t("password")}</FormLabel>
              <FormControl>
                <Input type="password" dir="ltr" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {form.formState.errors.root ? (
          <p className="text-destructive text-sm font-medium" role="alert">
            {form.formState.errors.root.message}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              {t("submitting")}
            </>
          ) : (
            t("submit")
          )}
        </Button>
      </form>
    </Form>
  );
}
