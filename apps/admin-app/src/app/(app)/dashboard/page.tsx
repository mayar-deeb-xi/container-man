import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerSession } from "~/lib/session";
import { UserCard } from "./_components/user-card";

export async function generateMetadata(): Promise<Metadata> {
  // Generated rather than static so the tab title follows the chosen language.
  const t = await getTranslations("Dashboard");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function DashboardPage() {
  const t = await getTranslations("Dashboard");

  // The group layout already gated this route; the call is deduplicated by
  // `cache()`, so this is a type narrowing rather than a second request.
  const session = await getServerSession();
  if (!session) {
    redirect("/login?next=/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("signedInAs", { name: session.name ?? session.email })}
        </p>
      </div>

      <UserCard initialUser={session} />
    </div>
  );
}
