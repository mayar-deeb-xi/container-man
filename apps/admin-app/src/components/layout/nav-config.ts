import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Factory,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

import type { AppAction, AppSubject } from "@repo/access";

interface NavLinkShape {
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

/**
 * A collapsible heading with links under it.
 *
 * Deliberately has no `href` of its own: a section is a place to put pages, not a page.
 * It also carries no `requires` — a section is visible exactly when something inside it
 * is, which falls out of filtering its children and cannot drift away from them.
 */
interface NavSectionShape {
  labelKey: string;
  icon: LucideIcon;
  items: readonly NavLinkShape[];
}

type NavEntryShape = NavLinkShape | NavSectionShape;

interface NavGroupShape {
  /** Omitted for the leading group: a heading over "everything" says nothing. */
  labelKey?: string;
  items: readonly NavEntryShape[];
}

/**
 * The console's navigation, as data.
 *
 * Shared by the sidebar and the header breadcrumb so the two cannot disagree
 * about what the current page is called — adding a page is one entry here.
 *
 * Two levels of structure, doing different jobs: groups are silent partitions that only
 * ever draw a separator and an optional heading, while sections are real, clickable
 * things the reader opens and closes. Pages that belong together behind one word go in a
 * section; the utility pages at the bottom that belong together only in the sense of not
 * belonging anywhere else stay a group.
 *
 * `as const satisfies` rather than a plain annotation: the shape is still checked,
 * but `labelKey` keeps its literal type. Widening it to `string` would defeat the
 * typed-message setup in `src/global.d.ts` and turn a mistyped key from a build
 * error back into a missing string at runtime.
 */
export const NAV_GROUPS = [
  {
    items: [
      { labelKey: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        labelKey: "administration",
        icon: ShieldCheck,
        items: [
          {
            labelKey: "users",
            href: "/users",
            icon: Users,
            requires: { action: "read", subject: "User" },
          },
          {
            labelKey: "roles",
            href: "/roles",
            icon: KeyRound,
            requires: { action: "read", subject: "Role" },
          },
        ],
      },
      {
        labelKey: "management",
        icon: Warehouse,
        items: [
          {
            labelKey: "containers",
            href: "/containers",
            icon: Boxes,
            requires: { action: "read", subject: "Container" },
          },
          {
            labelKey: "deliveries",
            href: "/deliveries",
            icon: Truck,
            requires: { action: "read", subject: "Delivery" },
          },
          {
            labelKey: "suppliers",
            href: "/suppliers",
            icon: Factory,
            requires: { action: "read", subject: "Supplier" },
          },
        ],
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
export type NavEntry = NavGroup["items"][number];
/** A heading with links under it — every entry that has children. */
export type NavSection = Extract<NavEntry, { items: readonly unknown[] }>;
/** A single page, whether it sits at the top level or inside a section. */
export type NavLink = Exclude<NavEntry, NavSection> | NavSection["items"][number];

/**
 * What the link requires, if anything.
 *
 * A function rather than a plain property read because `as const satisfies` keeps each
 * entry's literal type — so an entry with no requirement genuinely has no `requires`
 * key, and reading it straight off the union does not type-check. That is the trade for
 * keeping `labelKey` narrow enough to type-check against the message catalogue, which
 * is worth more than this one line.
 */
function requirementOf(link: NavLink): { action: AppAction; subject: AppSubject } | undefined {
  return "requires" in link ? link.requires : undefined;
}

/** A section, or a link, once it is known to be worth drawing. */
export type VisibleEntry =
  | { kind: "link"; link: NavLink }
  | { kind: "section"; section: NavSection; links: readonly NavLink[] };

export interface VisibleGroup {
  /** The literal keys the registry actually uses, so `t()` stays key-checked. */
  labelKey?: Extract<NavGroup, { labelKey: string }>["labelKey"];
  entries: readonly VisibleEntry[];
}

/**
 * The navigation this user should see, with the shape flattened into something the
 * sidebar can render without asking what kind of thing it is holding.
 *
 * Resolved here rather than in the component so that the two awkward consequences of
 * `as const satisfies` — a union whose members genuinely lack `requires` or `labelKey`, and
 * readonly tuples that resist being mapped — are dealt with once, at the place that
 * knows why they are that way.
 *
 * Filtered from the leaves up: a section or a group whose every link is hidden would
 * otherwise draw as a bare heading with nothing under it, and a section is only ever
 * as visible as what it contains.
 */
export function visibleNav(
  can: (action: AppAction, subject: AppSubject) => boolean,
): readonly VisibleGroup[] {
  const permitted = (link: NavLink) => {
    const requires = requirementOf(link);
    return !requires || can(requires.action, requires.subject);
  };

  return NAV_GROUPS.map((group) => ({
    labelKey: "labelKey" in group ? group.labelKey : undefined,
    entries: [...group.items].flatMap<VisibleEntry>((entry) => {
      if ("items" in entry) {
        const links = [...entry.items].filter(permitted);
        return links.length > 0 ? [{ kind: "section", section: entry, links }] : [];
      }
      return permitted(entry) ? [{ kind: "link", link: entry }] : [];
    }),
  })).filter((group) => group.entries.length > 0);
}

/** True when `href` is the current page or one of its descendants. */
export function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Every link, paired with the section holding it — flattened for lookup by path. */
const NAV_LINKS: readonly { link: NavLink; section?: NavSection }[] = NAV_GROUPS.flatMap((group) =>
  [...group.items].flatMap<{ link: NavLink; section?: NavSection }>((entry) =>
    "items" in entry
      ? [...entry.items].map((link) => ({ link, section: entry }))
      : [{ link: entry }],
  ),
);

/**
 * The link the given path belongs to, and the section it sits in if it sits in one.
 * Longest match wins.
 *
 * Unfiltered by ability on purpose: this is what the breadcrumb reads, and a page the
 * user has somehow reached still needs a name. Hiding the *link* is the sidebar's job.
 */
export function findNavItem(pathname: string): { link: NavLink; section?: NavSection } | undefined {
  return NAV_LINKS.filter((entry) => isActiveHref(pathname, entry.link.href)).sort(
    (a, b) => b.link.href.length - a.link.href.length,
  )[0];
}
