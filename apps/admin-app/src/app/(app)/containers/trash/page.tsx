import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Button } from "@repo/ui/components/button";
import { siteName } from "@repo/white-label/admin-app";

import { getDirection } from "~/i18n/config";
import { getServerAbility } from "~/lib/ability";
import { TrashTable } from "../_components/trash-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Containers.trash");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function ContainersTrashPage() {
  const t = await getTranslations("Containers.trash");

  // `delete Container`, not `read`: the trash and restore are two halves of undoing a
  // mistaken delete, and the API gates both behind the delete grant. Same `notFound()`
  // stance as the register — for anyone else this route may as well not exist.
  const ability = await getServerAbility();
  if (!ability.can("delete", "Container")) {
    notFound();
  }

  // Reading order, as everywhere else: "back" points the way the text came from. A server
  // component cannot ask `useDirection`, so this reads the same locale the root layout
  // stamped onto <html dir>.
  const BackIcon = getDirection(await getLocale()) === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="self-start" asChild>
          <Link href="/containers">
            <BackIcon />
            {t("back")}
          </Link>
        </Button>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
      </div>

      <TrashTable />
    </div>
  );
}
