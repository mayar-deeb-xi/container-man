import type messages from "../messages/en.json";
import type { Locale } from "~/i18n/config";

/**
 * Makes `useTranslations`/`getTranslations` key-checked and `Locale`-aware.
 *
 * With this in place a typo like `t("Nav.dashbord")` is a compile error rather
 * than a string rendered to the user, and English is the source of truth for
 * which keys exist — `messages/ar.json` is only ever a translation of it.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
