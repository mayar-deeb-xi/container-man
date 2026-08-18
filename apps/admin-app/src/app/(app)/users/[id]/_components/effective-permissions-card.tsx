"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";

import { useUserRules } from "~/services/users/use-user-rules";

/**
 * What the user's roles actually add up to.
 *
 * Read from the API rather than unioned from the roles in the browser. The backend
 * resolves this with the same code its guards use — placeholders substituted for *this*
 * user, inverted rules included — so the panel cannot claim a permission the API would
 * refuse. Recomputing it here would be a second implementation of precedence, and the
 * two would eventually disagree.
 */
export function EffectivePermissionsCard({ userId }: { userId: string }) {
  const t = useTranslations("Users.access.effective");
  const ta = useTranslations("Roles.verbs");
  const ts = useTranslations("Roles.subjects");
  const tc = useTranslations("Common");

  const rules = useUserRules(userId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {rules.isPending ? (
          <>
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-6 w-44" />
          </>
        ) : rules.isError ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">{t("loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void rules.refetch()}>
              {tc("retry")}
            </Button>
          </div>
        ) : (rules.data?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          rules.data?.map((rule, index) => (
            <div
              // Indexed, because the pair is *not* unique here: two roles granting
              // `read User` contribute two rules, and CASL evaluates both — one with a
              // condition and one without is exactly how a narrow grant gets widened.
              // Collapsing them would misreport what the API will do.
              key={`${rule.action}:${rule.subject}:${index}`}
              className="flex flex-col gap-1 rounded-lg border p-2.5 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {ta(rule.action)} · {ts(rule.subject)}
                </span>
                {rule.inverted ? <Badge variant="destructive">{t("denied")}</Badge> : null}
                {rule.fields?.length ? (
                  <Badge variant="outline" dir="ltr">
                    {rule.fields.join(", ")}
                  </Badge>
                ) : null}
              </div>

              {rule.conditions ? (
                <>
                  <p className="text-muted-foreground text-xs">{t("onlyWhere")}</p>
                  {/* The resolved conditions, placeholders already substituted — so what is
                      shown is the query that will actually run, not the template. JSON is
                      not localised text, hence the explicit direction. */}
                  <pre dir="ltr" className="bg-muted/50 overflow-x-auto rounded p-2 text-xs">
                    {JSON.stringify(rule.conditions, null, 2)}
                  </pre>
                </>
              ) : null}

              {rule.reason ? <p className="text-muted-foreground text-xs">{rule.reason}</p> : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
