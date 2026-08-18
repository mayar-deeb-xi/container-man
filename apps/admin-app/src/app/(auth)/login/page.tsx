import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { siteName } from "@repo/white-label/admin-app";

import { AppBrand } from "~/components/common/app-brand";
import { LocaleSwitcher } from "~/components/common/locale-switcher";
import { ModeToggle } from "~/components/common/mode-toggle";
import { LoginForm } from "./_components/login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Login");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function LoginPage() {
  const t = await getTranslations("Login");

  return (
    <main className="flex min-h-svh flex-col p-6">
      {/* Both switches are offered before sign-in on purpose: someone who cannot
          read the form yet is exactly the person who needs the language picker. */}
      <div className="flex items-center justify-between">
        <AppBrand />
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ModeToggle />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* useSearchParams needs a Suspense boundary to keep the page static. */}
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
