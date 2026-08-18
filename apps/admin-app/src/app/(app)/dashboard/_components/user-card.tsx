"use client";

import { LogOut } from "lucide-react";

import type { PublicUser } from "@repo/auth";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

import { useLogout, useSession } from "~/services/auth.service";

export function UserCard({ initialUser }: { initialUser: PublicUser }) {
  // Seeded from the server render, so there is no loading flash — the query then
  // keeps it fresh and is what the refresh interceptor exercises on expiry.
  const { data: user } = useSession();
  const logout = useLogout();
  const current = user ?? initialUser;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Details for the currently signed-in user.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <Row label="Name" value={current.name ?? "—"} />
        <Row label="Email" value={current.email} />
        <Row label="Role" value={current.role} />
        <Row label="User ID" value={current.id} mono />
      </CardContent>
      <CardFooter>
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut />
          {logout.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : undefined}>{value}</span>
    </div>
  );
}
