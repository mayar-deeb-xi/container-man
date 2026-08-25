"use client";

import { usePathname } from "next/navigation";

/**
 * Fades each page in as it arrives, rising slightly from below.
 *
 * A template already remounts on navigation, but only when its own segment
 * changes — moving deeper (say, a list to one of its rows) would not replay the
 * animation. Keying on the full pathname makes every navigation count.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="animate-in fade-in slide-in-from-bottom-5 duration-300 ease-in-out motion-reduce:animate-none"
    >
      {children}
    </div>
  );
}
