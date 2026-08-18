import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerSession } from "~/lib/session";
import { UsersTable } from "./_components/users-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Users");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function UsersPage() {
  const t = await getTranslations("Users");

  // The group layout already established there is a session; what this page adds
  // is the role check. `notFound()` rather than a redirect or a disabled table:
  // the API is admin-only, so for anyone else this route may as well not exist,
  // and rendering a table that answers 403 to every request only looks broken.
  const session = await getServerSession();
  if (session?.role !== "admin") {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      {/* The signed-in user's own id, so the table can grey out the one row the
          backend refuses to delete rather than letting them discover it by 403. */}
      <UsersTable currentUserId={session.id} />
    </div>
  );
}
