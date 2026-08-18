import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerAbility } from "~/lib/ability";
import { getServerSession } from "~/lib/session";
import { UserAccess } from "./_components/user-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Users.access");
  return { title: `${t("title")} · ${siteName}` };
}

/**
 * One user's roles, and what those roles add up to.
 *
 * Gated on `read Role` as well as `read User`: this page is about privilege, and being
 * allowed to see the account list does not make someone entitled to the privilege map —
 * which is exactly how the two endpoints behind it are gated.
 */
export default async function UserAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session, ability] = await Promise.all([getServerSession(), getServerAbility()]);
  if (!session || !ability.can("read", "User") || !ability.can("read", "Role")) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      {/* Whether this is the operator's own record decides whether the editor is usable
          at all: the API refuses to let anyone change their own roles, so the page says so
          rather than letting them find out by 403. */}
      <UserAccess userId={id} isSelf={id === session.id} />
    </div>
  );
}
