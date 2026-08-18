/**
 * The texture behind the sign-in page.
 *
 * Purely decorative and therefore `aria-hidden` and non-interactive: it carries no
 * information a screen reader or a pointer could want. Absolutely positioned so it can
 * sit inside the page's grid without claiming a cell — out-of-flow children are skipped
 * by grid placement, which is what lets one backdrop span both columns.
 *
 * Everything is drawn from theme tokens rather than fixed colours, so the same markup
 * reads as a pale blueprint in the light theme and a faint glow in the dark one.
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Two soft washes of brand colour, placed with logical insets so they follow the
          reading direction instead of stranding both glows on the same edge in Arabic. */}
      <div className="bg-primary/25 absolute -start-24 -top-32 size-[28rem] rounded-full blur-[7rem]" />
      <div className="bg-secondary/20 absolute -bottom-40 -end-24 size-[32rem] rounded-full blur-[7rem]" />

      {/* The logo's crate, tiled. Drawn as a pattern rather than a repeated background
          image so it stays a single vector that inherits `currentColor` and needs no
          second asset for the dark theme. */}
      <svg className="text-primary absolute inset-0 size-full opacity-[0.05] dark:opacity-[0.07]">
        <defs>
          <pattern id="auth-crate-tile" width="96" height="96" patternUnits="userSpaceOnUse">
            {/* The mark from `AppLogo`, scaled from its 24-unit viewBox to the tile. */}
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M48 10 84 28v40L48 86 12 68V28z" />
              <path d="M12 28l36 18 36-18" />
              <path d="M48 46v40" />
              <path d="M30 19v19.6" />
              <path d="M66 19v19.6" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#auth-crate-tile)" />
      </svg>
    </div>
  );
}
