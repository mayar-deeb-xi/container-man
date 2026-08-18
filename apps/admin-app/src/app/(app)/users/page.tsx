import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerAbility } from "~/lib/ability";
import { getServerSession } from "~/lib/session";
import { UsersTable } from "./_components/users-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Users");
  return { title: `${t("title")} · ${siteName}` };
}

export default async function UsersPage({
  searchParams,
}: {
  /** `?roleKey=…` — how the roles console links here to answer "who holds this role?". */
  searchParams: Promise<{ roleKey?: string }>;
}) {
  const t = await getTranslations("Users");
  const { roleKey } = await searchParams;

  // The group layout already established there is a session; what this page adds is the
  // permission check. `notFound()` rather than a redirect or a disabled table: every
  // request this page makes needs `read User`, so for anyone else the route may as well
  // not exist, and a table that answers 403 to every request only looks broken.
  const [session, ability] = await Promise.all([getServerSession(), getServerAbility()]);
  if (!session || !ability.can("read", "User")) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      {/* The signed-in user's own id, so the table can grey out the one row the backend
          refuses to delete rather than letting them discover it by 403. */}
      <UsersTable currentUserId={session.id} initialRoleKey={roleKey} />
    </div>
  );
}
