import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { siteName } from "@repo/white-label/admin-app";

import { getServerAbility } from "~/lib/ability";
import { DeliveryEditor } from "./_components/delivery-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("GoodsIn.detail");
  return { title: `${t("title")} · ${siteName}` };
}

/**
 * One goods-in record — the digital form.
 *
 * Fetched in the client component rather than here: the record is live-edited (pallets
 * added at the scale, photos attached, and finally the sign-off), so it needs the query
 * cache the mutations write back into.
 */
export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ability = await getServerAbility();
  if (!ability.can("read", "Delivery")) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <DeliveryEditor deliveryId={id} />
    </div>
  );
}
