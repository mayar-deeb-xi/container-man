import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "~/lib/session";
import { UserCard } from "./_components/user-card";

export const metadata: Metadata = { title: "Dashboard · container-man" };

export default async function DashboardPage() {
  // The proxy already bounced anyone without cookies, but that check is only a
  // redirect convenience — this is the one that actually gates the page.
  const session = await getServerSession();
  if (!session) {
    redirect("/login?next=/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Signed in as {session.name ?? session.email}.
        </p>
      </div>

      <UserCard initialUser={session} />
    </main>
  );
}
