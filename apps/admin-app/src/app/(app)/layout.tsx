import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SidebarInset, SidebarProvider } from "@repo/ui/components/sidebar";

import { AppFooter } from "~/components/layout/app-footer";
import { AppHeader } from "~/components/layout/app-header";
import { AppSidebar } from "~/components/layout/app-sidebar";
import { AbilityProvider } from "~/components/providers/ability-provider";
import { getServerSession } from "~/lib/session";

/** Written by SidebarProvider when the rail is toggled — see @repo/ui sidebar. */
const SIDEBAR_COOKIE = "sidebar_state";

/**
 * The signed-in shell: sidebar, header, footer.
 *
 * This is also where the session is actually enforced. `proxy.ts` only checks that
 * a cookie is present, which is a redirect convenience rather than an authorization
 * boundary — every route in this group is gated here, once, instead of each page
 * remembering to do it.
 *
 * It is also where the ability is published to the client tree. The session it already
 * fetched carries the user's CASL rules, so `<Can>` anywhere below costs no extra
 * request — and because those rules ride on the session query, a revoked role reaches
 * every guarded control on the next refetch instead of at the next reload.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  // Read on the server so a collapsed sidebar renders collapsed on the very first
  // paint. Left to the client, every page load would flash the expanded rail.
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE)?.value !== "false";

  return (
    <AbilityProvider user={session}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar user={session} />
        <SidebarInset className="flex min-h-svh flex-col">
          <AppHeader />
          <div className="flex-1">{children}</div>
          <AppFooter />
        </SidebarInset>
      </SidebarProvider>
    </AbilityProvider>
  );
}
