import type { LucideIcon } from "lucide-react";
import { Boxes, HelpCircle, LayoutDashboard, Settings, ShieldCheck, Users } from "lucide-react";

import type { AppAction, AppSubject } from "@repo/access";

interface NavItemShape {
  /** Resolved against the `Nav` message namespace — wording is translated. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
  /**
   * What the user must be permitted to do for this entry to appear. Omitted means
   * everyone signed in — the dashboard and the settings page belong to whoever is
   * looking at them.
   *
   * Declared beside the route rather than checked inside the sidebar so the rule lives
   * with the thing it governs: adding a page is still one entry, and forgetting the
   * requirement shows the link to everyone rather than hiding it from everyone — which
   * is the wrong direction, but the page behind it is still gated by its own check and
   * the API behind that.
   */
  requires?: { action: AppAction; subject: AppSubject };
}

interface NavGroupShape {
  labelKey: string;
  items: readonly NavItemShape[];
}

/**
 * The console's navigation, as data.
 *
 * Shared by the sidebar and the header breadcrumb so the two cannot disagree
 * about what the current page is called — adding a page is one entry here.
 *
 * `as const satisfies` rather than a plain annotation: the shape is still checked,
 * but `labelKey` keeps its literal type. Widening it to `string` would defeat the
 * typed-message setup in `src/global.d.ts` and turn a mistyped key from a build
 * error back into a missing string at runtime.
 */
export const NAV_GROUPS = [
  {
    labelKey: "groups.overview",
    items: [
      { labelKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        labelKey: "containers",
        href: "/containers",
        icon: Boxes,
        requires: { action: "read", subject: "Container" },
      },
      {
        labelKey: "users",
        href: "/users",
        icon: Users,
        requires: { action: "read", subject: "User" },
      },
      {
        labelKey: "roles",
        href: "/roles",
        icon: ShieldCheck,
        requires: { action: "read", subject: "Role" },
      },
    ],
  },
  {
    labelKey: "groups.system",
    items: [
      { labelKey: "settings", href: "/settings", icon: Settings },
      { labelKey: "support", href: "/support", icon: HelpCircle },
    ],
  },
] as const satisfies readonly NavGroupShape[];

export type NavGroup = (typeof NAV_GROUPS)[number];
export type NavItem = NavGroup["items"][number];

/** Every item, flattened — the breadcrumb does not care about grouping. */
// Spread rather than returning `group.items` directly: flatMap cannot flatten the
// readonly tuples that `as const` produces.
const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => [...group.items]);

/**
 * What the item requires, if anything.
 *
 * A function rather than a plain property read because `as const satisfies` keeps each
 * entry's literal type — so an entry with no requirement genuinely has no `requires`
 * key, and reading it straight off the union does not type-check. That is the trade for
 * keeping `labelKey` narrow enough to type-check against the message catalogue, which
 * is worth more than this one line.
 */
export function navItemRequirement(
  item: NavItem,
): { action: AppAction; subject: AppSubject } | undefined {
  return "requires" in item ? item.requires : undefined;
}

/** True when `href` is the current page or one of its descendants. */
export function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The entry the given path belongs to, if any. Longest match wins.
 *
 * Unfiltered by ability on purpose: this is what the breadcrumb reads, and a page the
 * user has somehow reached still needs a name. Hiding the *link* is the sidebar's job.
 */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) => isActiveHref(pathname, item.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
