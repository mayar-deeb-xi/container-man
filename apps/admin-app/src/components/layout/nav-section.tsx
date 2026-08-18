"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import { useDirection } from "@repo/ui/components/direction-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@repo/ui/components/sidebar";
import { cn } from "@repo/ui/lib/utils";

import type { NavLink, NavSection } from "./nav-config";
import { isActiveHref } from "./nav-config";

/** The section and its already-ability-filtered links. */
export interface VisibleNavSection {
  section: NavSection;
  links: readonly NavLink[];
}

/**
 * One collapsible sidebar section.
 *
 * Two renderings of the same list, because a section has no page of its own and so
 * cannot fall back to being a plain link: expanded, it opens in place; collapsed to
 * icons there is no room for a sub-list, so the same links open as a menu beside the
 * icon. Without that second rendering, collapsing the sidebar would put every nested
 * page out of reach until the reader expanded it again.
 */
export function NavSectionItem({ section, links }: VisibleNavSection) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();
  const direction = useDirection();

  const label = t(section.labelKey);
  const hasActiveLink = links.some((link) => isActiveHref(pathname, link.href));

  // `null` means "nobody has said" — the section then follows the current page, so
  // arriving at a nested route shows it open. A click pins it either way, which is
  // why this cannot simply be `open={hasActiveLink}`.
  const [pinnedOpen, setPinnedOpen] = useState<boolean | null>(null);
  const isOpen = pinnedOpen ?? hasActiveLink;

  // On mobile the sidebar is a sheet at full width, so it is never icon-collapsed
  // even when the desktop state says otherwise.
  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              isActive={hasActiveLink}
              tooltip={label}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <section.icon />
              <span>{label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            // Radix takes physical sides only, so "away from the sidebar" has to be
            // resolved by hand — the sidebar itself moves in a right-to-left locale.
            side={direction === "rtl" ? "left" : "right"}
            align="start"
            sideOffset={4}
            className="min-w-48 rounded-lg"
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">{label}</DropdownMenuLabel>
            {links.map((link) => (
              <DropdownMenuItem key={link.href} asChild>
                <Link href={link.href}>
                  <link.icon className="size-4" />
                  {t(link.labelKey)}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild open={isOpen} onOpenChange={setPinnedOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {/* Active when the page inside it is: closed, the section is the only thing
              standing in for that page, and open it is still where the reader is. */}
          <SidebarMenuButton isActive={hasActiveLink} tooltip={label}>
            <section.icon />
            <span>{label}</span>
            {/* Driven off the state we already hold rather than a `group-data` selector:
                pointing the arrow at the reader in both writing directions means three
                distinct angles, and stacked `rotate`/`scale` utilities compose into
                the wrong one of them. */}
            <ChevronRight
              className={cn(
                "ms-auto size-4 transition-transform duration-200",
                isOpen ? "rotate-90" : direction === "rtl" && "rotate-180",
              )}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <SidebarMenuSub>
            {links.map((link) => (
              <SidebarMenuSubItem key={link.href}>
                <SidebarMenuSubButton asChild isActive={isActiveHref(pathname, link.href)}>
                  <Link href={link.href}>
                    <link.icon />
                    <span>{t(link.labelKey)}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
