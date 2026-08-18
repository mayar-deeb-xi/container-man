/**
 * Brand-level values shared by every app in the monorepo.
 *
 * This package holds *what* an app is called and *where* its links point — never
 * *how* things are worded. Wording is translated, so it lives in each app's
 * `messages/*.json`; a link here carries a translation key rather than a label.
 */

/** Root brand. App-specific names are derived from this in each app's module. */
export const brandName = "Containex";

export const contactInfo = {
  email: "support@containex.local",
  phone: "+1 (555) 123-4567",
  address: "123 Main Street, City, State 12345",
} as const;

/**
 * Keys a footer/legal link may carry.
 *
 * A closed union rather than `string`: every consuming app resolves these against
 * its `Footer.links` message namespace, so a new key here is a compile error in
 * each app until that app has actually translated it.
 */
export type BrandLinkKey = "terms" | "privacy";

/** A footer/legal link — where it points here, what it is called in the catalogue. */
export interface BrandLink {
  labelKey: BrandLinkKey;
  url: string;
}
