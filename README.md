# container-man

A Turborepo monorepo: a Next.js admin console backed by a NestJS API, with
PostgreSQL + Drizzle and cookie-based JWT auth.

## Stack

| Layer    | Choice                                                         |
| -------- | -------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), shadcn/ui, Tailwind v4                |
| Forms    | react-hook-form + Zod (`zodResolver`)                          |
| Data     | axios + TanStack React Query                                   |
| Backend  | NestJS 11, class-validator DTOs                                |
| Database | PostgreSQL 17 + Drizzle ORM                                    |
| Auth     | JWT access + refresh tokens in httpOnly cookies, with rotation |

## Layout

```
apps/
  admin-app/     Next.js admin console (port 3000)
  backend/       NestJS API (port 3001)
packages/
  auth/          JWT signing/verification, password hashing, cookie contract
  db/            Drizzle schema, client, migrations, seed
  ui/            shadcn/ui components (Tailwind v4)
tooling/
  eslint/        Shared flat configs: base, next-js, nest, react-internal
  typescript/    Shared tsconfigs: base, nextjs, nest, library, react-library
  prettier/      Shared Prettier config with import sorting
```

`packages/auth` is shared because the backend and the admin app's `proxy.ts` both
need the same cookie names, TTLs, and token handling — keeping them in one place
is what stops the two from drifting apart. `packages/db` is used by the **backend
only**; the admin app talks to the API and never to Postgres.

## Getting started

```bash
pnpm install
cp .env.example .env      # a single .env at the root serves every workspace
pnpm dev:db               # start Postgres in Docker
pnpm db:migrate           # apply migrations
pnpm db:seed              # create the admin user (there is no signup flow)
pnpm dev                  # admin-app on :3000, backend on :3001
```

Sign in at http://localhost:3000/login with the credentials printed by
`pnpm db:seed` (default `admin@example.com` / `password123`).

## Scripts

| Command            | What it does                                      |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | Run every app in watch mode                       |
| `pnpm build`       | Build all workspaces                              |
| `pnpm lint`        | ESLint, zero warnings tolerated                   |
| `pnpm check-types` | `tsc --noEmit` everywhere                         |
| `pnpm format`      | Prettier write                                    |
| `pnpm db:generate` | Generate a migration from schema changes          |
| `pnpm db:migrate`  | Apply pending migrations                          |
| `pnpm db:push`     | Push schema directly (dev only, skips migrations) |
| `pnpm db:seed`     | Upsert the admin user — safe to re-run            |
| `pnpm db:studio`   | Drizzle Studio                                    |
| `pnpm ui-add`      | Add a shadcn component to `packages/ui`           |

## Auth design

Users are created by `pnpm db:seed`; there is no registration endpoint.

**Endpoints** — `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
`GET /auth/me`.

**Tokens.** Login sets two httpOnly cookies: a short-lived access token (15m) and
a long-lived refresh token (7d). The refresh token's `jti` _is_ the `sessions` row
id, so rotation and reuse-detection are a single primary-key lookup. Only a
SHA-256 digest of the refresh token is stored.

**Rotation and reuse-detection.** Every refresh revokes the presented token and
issues a new pair. A token presented after it was revoked means it was captured,
so all of that user's sessions are revoked. Legitimate races (two tabs, a prefetch
alongside a navigation) are distinguished from theft by `sessions.replaced_by_id`
plus a 30-second grace window — without it, ordinary concurrency would sign users
out.

**Where refresh happens.** `apps/admin-app/src/proxy.ts` (Next 16's replacement
for `middleware.ts`) refreshes expired access tokens. It has to be there: server
components cannot set cookies, so they can only observe that a token expired,
never fix it — which would leave `/dashboard` and `/login` redirecting to each
other forever. In the browser, `src/lib/axios.ts` does the same job for XHR,
de-duplicating concurrent 401s behind one in-flight refresh.

**What actually authorizes.** The proxy is a routing convenience and deliberately
does _not_ verify JWT signatures — that would require shipping the backend's
signing secret into the frontend, letting it mint tokens. Real checks are
`getServerSession()` (server components) and the backend's guards.

**Cookie scope.** Works out of the box on localhost because ports are not part of
a "site". In production, web and API must share a registrable domain — set
`COOKIE_DOMAIN=.example.com` and `COOKIE_SECURE=true`. If they must live on
genuinely different domains, set `COOKIE_SAMESITE=none` (which requires
`COOKIE_SECURE=true`).

## Conventions in `admin-app`

- **Server state lives in `src/services/*.service.ts`** — every axios call and
  React Query hook. A hook like `useLogin` isn't owned by the login page; a
  re-auth prompt may need it too.
- **Route-only code colocates** in `_components/` and `_lib/` next to `page.tsx`.
  The `_` prefix makes them Next.js private folders, excluded from routing.

## Environment

All variables live in one root `.env` (see `.env.example`). Both apps validate at
boot and refuse to start on a bad value — the backend with class-validator
(`apps/backend/src/config/env.ts`), the admin app with `@t3-oss/env-nextjs`
(`apps/admin-app/src/env.ts`).
