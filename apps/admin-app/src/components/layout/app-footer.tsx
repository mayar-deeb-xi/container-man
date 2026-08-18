import { getTranslations } from "next-intl/server";

import { bottomLinks, siteName } from "@repo/white-label/admin-app";

export async function AppFooter() {
  const t = await getTranslations("Footer");

  return (
    <footer className="bg-background/80 sticky bottom-0 hidden flex-col justify-between gap-1 border-t border-dashed px-4 py-1 text-xs backdrop-blur-md md:flex md:flex-row md:items-center">
      {/* The year is read on the server and shipped as text, so it cannot drift
          between the server and client renders the way a client-side clock would. */}
      <p className="text-muted-foreground">
        {t("copyright", { year: new Date().getFullYear(), siteName })}
      </p>

      <ul className="flex gap-4">
        {bottomLinks.map((link) => (
          <li key={link.labelKey}>
            <a href={link.url} className="hover:text-primary underline-offset-2 hover:underline">
              {/* White-label decides which links exist and where they point; the
                  message catalogue decides what they are called in each language. */}
              {t(`links.${link.labelKey}`)}
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
