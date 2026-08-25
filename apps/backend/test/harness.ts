import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { AppAbility, AppAction, AppSubject } from "@repo/access";
import type { Database, NewContainer, NewRole, NewUser } from "@repo/db";
import { createAppAbility } from "@repo/access";
import {
  containers,
  permissions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "@repo/db";
import * as schema from "@repo/db/schema";

/**
 * The tests' own database, on the local Docker Postgres from docker-compose.yml.
 *
 * Deliberately NOT the root .env's DATABASE_URL: that may point anywhere (it points at a
 * hosted instance right now), and a test run truncates tables. The suite only ever
 * touches a database named `container_man_test`, which the global setup drops and
 * recreates from the migrations on every run.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/container_man_test";

export interface TestConnection {
  db: Database;
  end: () => Promise<void>;
}

export function connect(): TestConnection {
  const client = postgres(TEST_DATABASE_URL, { max: 5, transform: undefined, onnotice: () => {} });
  return {
    db: drizzle(client, { schema }) as unknown as Database,
    end: () => client.end({ timeout: 5 }),
  };
}

/**
 * Empties every mutable table. The permission catalog stays: it is a projection of
 * `PERMISSION_CATALOG` seeded once in the global setup, not test data.
 */
export async function resetDb(db: Database): Promise<void> {
  await db.execute(sql`truncate table users, roles, containers restart identity cascade`);
}

let seq = 0;

export async function createUser(db: Database, overrides: Partial<NewUser> = {}) {
  const n = ++seq;
  const [user] = await db
    .insert(users)
    .values({
      email: `user-${n}@test.local`,
      passwordHash: "test-only-hash",
      name: `User ${n}`,
      ...overrides,
    })
    .returning();
  if (!user) throw new Error("fixture: user insert returned no row");
  return user;
}

export interface GrantSpec {
  action: AppAction;
  subject: AppSubject;
  conditions?: Record<string, unknown> | null;
  fields?: string[] | null;
}

/** A role plus its grants, wired through the real permission catalog. */
export async function createRole(
  db: Database,
  grants: GrantSpec[],
  overrides: Partial<NewRole> = {},
) {
  const n = ++seq;
  const [role] = await db
    .insert(roles)
    .values({ key: `role-${n}`, name: `Role ${n}`, isSystem: false, ...overrides })
    .returning();
  if (!role) throw new Error("fixture: role insert returned no row");

  for (const grant of grants) {
    const [permission] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(eq(permissions.action, grant.action), eq(permissions.subject, grant.subject)))
      .limit(1);
    if (!permission) {
      throw new Error(`fixture: ${grant.action}:${grant.subject} is not in the seeded catalog`);
    }

    await db.insert(rolePermissions).values({
      roleId: role.id,
      permissionId: permission.id,
      conditions: grant.conditions ?? null,
      fields: grant.fields ?? null,
    });
  }

  return role;
}

export async function assignRole(db: Database, userId: string, roleId: string): Promise<void> {
  await db.insert(userRoles).values({ userId, roleId });
}

/** A live refresh session, for tests about revocation on password change and deletion. */
export async function createSession(db: Database, userId: string) {
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      refreshTokenHash: `test-hash-${++seq}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();
  if (!session) throw new Error("fixture: session insert returned no row");
  return session;
}

export async function createContainer(db: Database, overrides: Partial<NewContainer> = {}) {
  const n = ++seq;
  const [row] = await db
    .insert(containers)
    .values({
      containerNumber: `TSTU${String(n).padStart(6, "0")}0`,
      type: "dry",
      sizeFt: 20,
      tareWeightKg: 2200,
      maxGrossWeightKg: 24000,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("fixture: container insert returned no row");
  return row;
}

/**
 * An ability straight from rule objects, the way tests want to spell them. The loose
 * input type is deliberate: tests also simulate rules that the current `AppRule` can no
 * longer express (a stale `inverted` row) to prove the runtime refuses them.
 */
export function ability(...rules: object[]): AppAbility {
  return createAppAbility(rules as never);
}
