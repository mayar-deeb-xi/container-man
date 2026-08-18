import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerAbility } from "~/lib/ability";
import { ContainersTable } from "./_components/containers-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Containers");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function ContainersPage() {
  const t = await getTranslations("Containers");

  // The group layout already established there is a session; what this page adds is the
  // permission check. `notFound()` rather than a redirect or a disabled table: every request
  // this page makes needs `read Container`, so for anyone else the route may as well not
  // exist, and a table that answers 403 to everything only looks broken.
  const ability = await getServerAbility();
  if (!ability.can("read", "Container")) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <ContainersTable />
    </div>
  );
}
