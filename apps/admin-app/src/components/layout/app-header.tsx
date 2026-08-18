"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import { Separator } from "@repo/ui/components/separator";
import { SidebarTrigger } from "@repo/ui/components/sidebar";

import { LocaleSwitcher } from "~/components/common/locale-switcher";
import { ModeToggle } from "~/components/common/mode-toggle";
import { findNavItem } from "./nav-config";

export function AppHeader() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <header className="bg-background/80 sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-dashed px-4 backdrop-blur-md">
      <SidebarTrigger className="-ms-1" aria-label={t("toggleSidebar")} />
      <Separator orientation="vertical" className="me-2 data-[orientation=vertical]:h-4" />

      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          {/* The section is a heading, not a page, so it names where the reader is
              without pretending to be somewhere they can go. Dropped on narrow
              screens, where the page name is the part worth the room. */}
          {current?.section && (
            <>
              <BreadcrumbItem className="hidden sm:block">
                {t(current.section.labelKey)}
              </BreadcrumbItem>
              {/* The default separator is a chevron, which points the wrong way in Arabic. */}
              <BreadcrumbSeparator className="hidden sm:block rtl:[&>svg]:-scale-x-100" />
            </>
          )}
          <BreadcrumbItem>
            {/* Named from the nav registry, so a page can never end up with a
                breadcrumb that disagrees with its own sidebar entry. */}
            <BreadcrumbPage>{current ? t(current.link.labelKey) : null}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        <ModeToggle />
      </div>
    </header>
  );
}
