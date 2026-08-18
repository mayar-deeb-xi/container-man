import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import type { Locale } from "./config";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Resolves the locale and messages for every server render.
 *
 * Registered through `createNextIntlPlugin()` in `next.config.ts`, which is what
 * makes `getLocale()`/`getTranslations()` work in server components without the
 * locale being threaded through as a prop.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const requested = cookieStore.get(LOCALE_COOKIE)?.value;

  // An unknown or absent cookie value falls back rather than throwing — the
  // cookie is user-writable, so a bad value must not be able to 500 the app.
  const locale: Locale = isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
