import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerAbility } from "~/lib/ability";
import { RoleEditor } from "./_components/role-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Roles.detail");
  return { title: `${t("title")} · ${siteName}` };
}

/**
 * One role's permissions.
 *
 * The role itself is fetched in the client component rather than here: the matrix is
 * live-editable, so it needs the query cache the mutation writes back into — fetching on
 * the server as well would only add a copy that goes stale on the first save.
 */
export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ability = await getServerAbility();
  if (!ability.can("read", "Role")) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <RoleEditor roleId={id} />
    </div>
  );
}
