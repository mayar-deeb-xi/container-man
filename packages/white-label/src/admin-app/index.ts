import type { BrandLink } from "../index";
import { brandName, contactInfo } from "../index";

export const siteName = `${brandName} admin`;

/** Short form used where space is tight — the collapsed sidebar rail, favicons. */
export const siteShortName = "cm";

export const bottomLinks: readonly BrandLink[] = [
  { labelKey: "terms", url: "#" },
  { labelKey: "privacy", url: "#" },
];

export { contactInfo };
