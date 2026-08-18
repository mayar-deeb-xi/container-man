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
import { bottomLinks, siteName } from "@repo/white-label/admin-app";

import { AppBrand } from "~/components/common/app-brand";
import { LocaleSwitcher } from "~/components/common/locale-switcher";
import { ModeToggle } from "~/components/common/mode-toggle";
import { AuthBackdrop } from "../_components/auth-backdrop";
import { LoginForm } from "./_components/login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Login");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function LoginPage() {
  const t = await getTranslations("Login");
  const tf = await getTranslations("Footer");

  return (
    <main className="relative flex min-h-svh flex-col">
      <AuthBackdrop />

      {/* One full-width column so the card centres on the page rather than in a half
          of it. `relative` so the column paints above the backdrop, not under it. */}
      <div className="relative flex flex-1 flex-col gap-10 p-6 md:p-10">
        {/* Both switches are offered before sign-in on purpose: someone who cannot
            read the form yet is exactly the person who needs the language picker. */}
        <div className="flex items-center justify-between gap-4">
          <AppBrand />
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ModeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center">
          {/* Translucent rather than solid: the glow behind it stays faintly visible,
              which is what keeps the card looking placed on the page instead of
              pasted over it. */}
          <Card className="bg-card/85 w-full max-w-sm shadow-xl backdrop-blur-sm">
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

        {/* The app shell's footer is sticky and belongs to the signed-in chrome, so the
            same two links are laid out here rather than reusing that component. */}
        <footer className="text-muted-foreground flex flex-col-reverse items-center gap-2 text-xs sm:flex-row sm:justify-between">
          {/* The year is read on the server and shipped as text, so it cannot drift
              between the server and client renders the way a client-side clock would. */}
          <p>{tf("copyright", { year: new Date().getFullYear(), siteName })}</p>

          <ul className="flex gap-4">
            {bottomLinks.map((link) => (
              <li key={link.labelKey}>
                <a
                  href={link.url}
                  className="hover:text-primary underline-offset-2 hover:underline"
                >
                  {tf(`links.${link.labelKey}`)}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </div>
    </main>
  );
}
