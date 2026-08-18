import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@repo/ui/components/card";
import { siteName } from "@repo/white-label/admin-app";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Containers");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function ContainersPage() {
  const t = await getTranslations("Containers");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      {/* Placeholder: this route exists so the sidebar entry leads somewhere real
          rather than 404ing. Replace the card once there is data to list. */}
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Boxes className="text-muted-foreground size-8" />
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
