"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import type { Locale } from "~/i18n/config";
import { setLocale } from "~/i18n/actions";
import { localeNames, locales } from "~/i18n/config";

export function LocaleSwitcher({ size = "icon" }: { size?: "icon" | "default" }) {
  const t = useTranslations("Locale");
  const active = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSelect(locale: Locale) {
    if (locale === active) return;

    startTransition(async () => {
      await setLocale(locale);
      // The action only writes the cookie. `refresh()` is what re-runs the server
      // components — and with them `<html lang>`/`dir` — in the new language.
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={isPending} aria-label={t("change")}>
          <Languages className="size-[1.2rem]" />
          <span className="sr-only">{t("change")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => onSelect(locale)}
            aria-current={locale === active ? "true" : undefined}
            className={locale === active ? "bg-accent" : undefined}
          >
            {/* Each language is named in itself, so it is legible to the person
                who needs it even when the UI is currently in another language. */}
            <span lang={locale}>{localeNames[locale]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
