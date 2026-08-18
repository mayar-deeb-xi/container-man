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
import { isActiveHref, NAV_GROUPS, navItemRequirement } from "./nav-config";
import { NavUser } from "./nav-user";

export function AppSidebar({ user }: { user: SessionUser }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const direction = useDirection();
  const ability = useAbility();

  // Filtered before the groups are drawn, not per item: a group whose every entry is
  // hidden would otherwise render as a bare heading with nothing under it.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const requires = navItemRequirement(item);
      return !requires || ability.can(requires.action, requires.subject);
    }),
  })).filter((group) => group.items.length > 0);

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
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const label = t(item.labelKey);
                const isActive = isActiveHref(pathname, item.href);

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                      <Link href={item.href}>
                        <item.icon />
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
