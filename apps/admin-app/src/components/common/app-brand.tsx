import Link from "next/link";

import { cn } from "@repo/ui/lib/utils";
import { siteName } from "@repo/white-label/admin-app";

/**
 * The mark. `fill="currentColor"` rather than a fixed colour so it inherits from
 * whatever it sits in and therefore works in both themes without a second asset.
 */
export function AppLogo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-5", className)}
      {...props}
    >
      {/* An isometric container: a stack of boxes with a shipping-crate ridge. */}
      <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" />
      <path d="M3 7l9 4.5L21 7" />
      <path d="M12 11.5v10" />
      <path d="M7.5 4.75v4.9" />
      <path d="M16.5 4.75v4.9" />
    </svg>
  );
}

export function AppBrand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("hover:text-primary flex items-center gap-2 transition-colors", className)}
    >
      <AppLogo />
      <span className="text-lg font-semibold tracking-tight">{siteName}</span>
    </Link>
  );
}
