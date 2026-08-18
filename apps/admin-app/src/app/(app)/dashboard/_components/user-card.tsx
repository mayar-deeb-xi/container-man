"use client";

import { useTranslations } from "next-intl";

import type { PublicUser } from "@repo/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { useSession } from "~/services/auth.service";

export function UserCard({ initialUser }: { initialUser: PublicUser }) {
  const t = useTranslations("Dashboard.account");

  // Seeded from the server render, so there is no loading flash — the query then
  // keeps it fresh and is what the refresh interceptor exercises on expiry.
  const { data: user } = useSession();
  const current = user ?? initialUser;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <Row label={t("name")} value={current.name ?? t("empty")} />
        <Row label={t("email")} value={current.email} />
        <Row label={t("role")} value={current.role} />
        <Row label={t("userId")} value={current.id} mono />
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {/* `dir="ltr"` on identifiers: an id or email is not Arabic text, and would
          otherwise be reordered by the bidi algorithm in a right-to-left layout. */}
      <span className={mono ? "font-mono text-xs" : undefined} dir={mono ? "ltr" : undefined}>
        {value}
      </span>
    </div>
  );
}
