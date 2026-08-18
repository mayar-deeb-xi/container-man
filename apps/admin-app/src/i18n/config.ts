/**
 * Locale configuration.
 *
 * The locale is held in a cookie rather than a URL segment (`/en/dashboard`).
 * This is an admin console behind a login: nothing here is crawled or shared, so
 * a locale in the path would buy no SEO while costing a rewrite of every link,
 * redirect, and `proxy.ts` guard in the app. A cookie keeps routing untouched.
 */
export const locales = ["en", "ar", "de"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie name. Also read by `src/i18n/request.ts` on every server render. */
export const LOCALE_COOKIE = "locale";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Writing direction per locale, used for `<html dir>` and to flip the sidebar to
 * the other edge. Tailwind's logical properties (`ps-*`, `text-start`) handle
 * most of the rest on their own.
 */
export const localeDirections: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
  de: "ltr",
};

/** Endonyms — a language picker should name each language in that language. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  de: "Deutsch",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function getDirection(locale: Locale): "ltr" | "rtl" {
  return localeDirections[locale];
}
