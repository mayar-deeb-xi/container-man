import type { LucideIcon } from "lucide-react";
import { Boxes, HelpCircle, LayoutDashboard, Settings, Users } from "lucide-react";

interface NavItemShape {
  /** Resolved against the `Nav` message namespace — wording is translated. */
  labelKey: string;
  href: string;
  icon: LucideIcon;
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
      { labelKey: "containers", href: "/containers", icon: Boxes },
      { labelKey: "users", href: "/users", icon: Users },
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

/** True when `href` is the current page or one of its descendants. */
export function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav entry the given path belongs to, if any. Longest match wins. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter((item) => isActiveHref(pathname, item.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}
