"use server";

import { cookies } from "next/headers";

import type { Locale } from "./config";
import { defaultLocale, isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./config";

/**
 * Persists the reader's language choice.
 *
 * A server action rather than a client-side cookie write because the locale is
 * read during the *server* render — setting it in the browser would leave the
 * already-rendered server components in the old language until a hard reload.
 * The caller follows this with `router.refresh()` to re-render in the new locale.
 */
export async function setLocale(locale: Locale): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(LOCALE_COOKIE, isLocale(locale) ? locale : defaultLocale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}
