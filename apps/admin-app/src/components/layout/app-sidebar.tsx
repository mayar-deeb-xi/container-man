"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { useDirection } from "@repo/ui/components/direction-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@repo/ui/components/sidebar";
import { siteName } from "@repo/white-label/admin-app";

import type { SessionUser } from "~/services/auth/types";
import { AppLogo } from "~/components/common/app-brand";
import { useAbility } from "~/components/providers/ability-provider";
import { isActiveHref, visibleNav } from "./nav-config";
import { NavSectionItem } from "./nav-section";
import { NavUser } from "./nav-user";

export function AppSidebar({ user }: { user: SessionUser }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const direction = useDirection();
  const ability = useAbility();

  // What this user may see, already pruned of empty sections and groups.
  const groups = visibleNav((action, subject) => ability.can(action, subject));

  return (
    // In a right-to-left locale the sidebar belongs on the right — `dir` alone
    // will not move it, because the component positions itself with `left`/`right`.
    <Sidebar collapsible="icon" side={direction === "rtl" ? "right" : "left"}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <AppLogo />
                </div>
                <div className="grid flex-1 text-start leading-tight">
                  <span className="truncate font-semibold tracking-tight">{siteName}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, index) => (
          <SidebarGroup key={group.labelKey ?? index}>
            {group.labelKey && <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.entries.map((entry) => {
                if (entry.kind === "section") {
                  return (
                    <NavSectionItem
                      key={entry.section.labelKey}
                      section={entry.section}
                      links={entry.links}
                    />
                  );
                }

                const { link } = entry;
                const label = t(link.labelKey);

                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActiveHref(pathname, link.href)}
                      tooltip={label}
                    >
                      <Link href={link.href}>
                        <link.icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            {index < groups.length - 1 && <SidebarSeparator />}
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Signing out lives here rather than on a page: it has to be reachable from
          anywhere in the console, and this is the one region present on every route. */}
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
