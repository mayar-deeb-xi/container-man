import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@repo/ui/components/button";
import { siteName } from "@repo/white-label/admin-app";

import { getDirection } from "~/i18n/config";
import { getServerAbility } from "~/lib/ability";
import { SupplierTrashTable } from "../_components/supplier-trash-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Suppliers.trash");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function SuppliersTrashPage() {
  const t = await getTranslations("Suppliers.trash");

  // `delete Supplier`, like the containers trash: seeing the bin and emptying it back
  // out are two halves of the same grant.
  const ability = await getServerAbility();
  if (!ability.can("delete", "Supplier")) {
    notFound();
  }

  const BackIcon = getDirection(await getLocale()) === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="self-start" asChild>
          <Link href="/suppliers">
            <BackIcon />
            {t("back")}
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
      </div>

      <SupplierTrashTable />
    </div>
  );
}
