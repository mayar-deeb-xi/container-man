import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerAbility } from "~/lib/ability";
import { DeliveriesTable } from "./_components/deliveries-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("GoodsIn");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function DeliveriesPage() {
  const t = await getTranslations("GoodsIn");

  const ability = await getServerAbility();
  if (!ability.can("read", "Delivery")) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <DeliveriesTable />
    </div>
  );
}
