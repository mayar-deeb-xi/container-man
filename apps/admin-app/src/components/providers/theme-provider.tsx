"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Thin wrapper so the root layout — a server component — can mount next-themes,
 * which needs to be a client component to read localStorage before paint.
 *
 * `attribute="class"` matches the `@custom-variant dark (&:is(.dark *))` rule in
 * globals.css; changing one without the other silently breaks dark mode.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
