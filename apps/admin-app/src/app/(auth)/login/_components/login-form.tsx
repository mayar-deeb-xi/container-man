"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { useLogin } from "~/services/auth.service";
import { loginSchema } from "../_lib/schemas";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
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
        form.setError("root", { message: "Invalid email or password" });
        form.resetField("password");
        return;
      }
      toast.error(getApiErrorMessage(error, "Could not sign in. Please try again."));
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
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="admin@example.com"
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
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </Form>
  );
}
