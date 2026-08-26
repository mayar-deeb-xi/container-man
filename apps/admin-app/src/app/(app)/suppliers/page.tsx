import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerAbility } from "~/lib/ability";
import { SuppliersTable } from "./_components/suppliers-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Suppliers");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function SuppliersPage() {
  const t = await getTranslations("Suppliers");

  // The register of who delivers, names included — which is exactly what `read Supplier`
  // gates. Goods-in staff work from codes and never need this page.
  const ability = await getServerAbility();
  if (!ability.can("read", "Supplier")) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <SuppliersTable />
    </div>
  );
}
