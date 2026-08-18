import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { contactInfo, siteName } from "@repo/white-label/admin-app";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Support");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function SupportPage() {
  const t = await getTranslations("Support");

  const rows = [
    { label: t("email"), value: contactInfo.email, href: `mailto:${contactInfo.email}` },
    { label: t("phone"), value: contactInfo.phone, href: `tel:${contactInfo.phone}` },
    { label: t("address"), value: contactInfo.address },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{siteName}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{row.label}</span>
              {/* Contact details are never localised text, so they keep LTR order. */}
              <span dir="ltr">
                {row.href ? (
                  <a href={row.href} className="hover:text-primary hover:underline">
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
