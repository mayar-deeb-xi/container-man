import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { siteName } from "@repo/white-label/admin-app";

import { LocaleSwitcher } from "~/components/common/locale-switcher";
import { ModeToggle } from "~/components/common/mode-toggle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Settings");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function SettingsPage() {
  const t = await getTranslations("Settings");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      {/* The same two controls as the header, given room to be labelled — the
          header versions are icon-only and easy to miss. */}
      <Card>
        <CardHeader>
          <CardTitle>{t("appearance.title")}</CardTitle>
          <CardDescription>{t("appearance.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ModeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("language.title")}</CardTitle>
          <CardDescription>{t("language.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LocaleSwitcher />
        </CardContent>
      </Card>
    </div>
  );
}
