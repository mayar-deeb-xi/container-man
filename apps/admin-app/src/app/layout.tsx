import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";

import { DirectionProvider } from "@repo/ui/components/direction-provider";
import { Toaster } from "@repo/ui/components/sonner";
import { siteName } from "@repo/white-label/admin-app";

import { QueryProvider } from "~/components/providers/query-provider";
import { ThemeProvider } from "~/components/providers/theme-provider";
import { getDirection } from "~/i18n/config";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: siteName,
  description: "Container management admin console",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved by src/i18n/request.ts from the `locale` cookie. It has to be read
  // here because `lang` and `dir` live on <html>, which only this layout renders.
  const locale = await getLocale();
  const direction = getDirection(locale);

  return (
    // suppressHydrationWarning is required by next-themes: it writes the theme
    // class onto <html> before React hydrates, so the markup deliberately differs.
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Rendered from a server component, so locale and messages are inherited
            from the request config — they do not need to be passed explicitly. */}
        <NextIntlClientProvider>
          <DirectionProvider dir={direction}>
            <ThemeProvider>
              <QueryProvider>{children}</QueryProvider>
              <Toaster richColors position={direction === "rtl" ? "top-left" : "top-right"} />
            </ThemeProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
