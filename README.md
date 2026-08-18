# container-man

A Turborepo monorepo: a Next.js admin console backed by a NestJS API, with
PostgreSQL + Drizzle and cookie-based JWT auth.

## Stack

| Layer    | Choice                                                         |
| -------- | -------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), shadcn/ui, Tailwind v4                |
| Theming  | next-themes, class-based dark mode                             |
| i18n     | next-intl 4, cookie-based locale, English + Arabic (RTL)       |
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
  ui/            shadcn/ui components (Tailwind v4) — no stylesheet of its own
  white-label/   Brand values: site names, contact details, footer links
tooling/
  eslint/        Shared flat configs: base, next-js, nest, react-internal
  typescript/    Shared tsconfigs: base, nextjs, nest, library, react-library
  prettier/      Shared Prettier config with import sorting
```

Inside `apps/backend/src`, feature modules live under `modules/` and anything more
than one of them needs sits beside it:

```
modules/auth/, modules/users/   controller + service + module, with dto/ and entities/
guards/                         JwtAccessGuard, JwtRefreshGuard, RolesGuard
decorators/                     CurrentUser, Roles
lib/                            response envelope, pagination query, Drizzle provider
config/                         env validation and the typed AppConfigService
```

Guards and decorators are deliberately outside `modules/`: every module reaches for
them, and leaving them inside the one that happened to need them first makes every
later import read as a dependency on that feature.

`packages/auth` is shared because the backend and the admin app's `proxy.ts` both
need the same cookie names, TTLs, and token handling — keeping them in one place
is what stops the two from drifting apart. `packages/db` is used by the **backend
only**; the admin app talks to the API and never to Postgres.

`packages/white-label` holds _what_ an app is called and _where_ its links point,
never _how_ anything is worded — wording is translated, so it lives in each app's
`messages/*.json`. A link there carries a translation key rather than a label.

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

There is no registration endpoint. `pnpm db:seed` creates the first admin, and
every account after that is created by an admin through `POST /users`.

**Endpoints** — `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
`GET /auth/me`.

The first three answer **204**: their entire effect is the cookies on the response,
and none of them echoes the user back. Identity has exactly one source — `/auth/me`
— so a client can never render a copy it was handed at login while the row behind
it has moved on. It also keeps each route to one job: signing in is not the same
question as "who am I".

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

## User management

**Endpoints** — `GET /users`, `GET /users/:id`, `POST /users`, `PATCH /users/:id`,
`DELETE /users/:id`. All five are admin-only: `JwtAccessGuard` attaches the token
payload and `RolesGuard` resolves it to a live row. The role is re-read from the
database rather than trusted from the token, because an access token is valid for
15 minutes and would otherwise let someone demoted (or deleted) a moment ago keep
acting as an admin until it expired.

**Listing** is `skip`/`take`, named to match the `pagination` half of the response
envelope so a client can page by echoing what it was last given. `search` matches
email and name case-insensitively; `role` filters. `take` is capped at 100.

**Serialization is the boundary.** Services return database rows straight into the
`BaseResponse` envelope — no hand-written mapper in between — and the `@Expose`
allowlist on each module's `UserEntity` is what decides which columns survive.
`ClassSerializerInterceptor` (registered in `main.ts`) runs it against the class
named by the controller's `@SerializeOptions({ type: BaseResponseDTO(UserEntity) })`.
Adding a column to the table is therefore safe by default; exposing it is the
deliberate act. The corollary: a controller that returns a row _without_ that
decorator ships the whole record, `password_hash` included — so declare it on the
controller, not per route, and a route added later inherits it.

**Deletes are soft.** `DELETE` stamps `users.deleted_at` and revokes every session
the user holds, in one transaction — a user must never end up flagged as deleted
while still holding a refresh token that mints new access tokens. Every read path
filters on `deleted_at is null`; leave that predicate off anywhere and a deleted
user starts authenticating again.

The email index is **partial** (`where deleted_at is null`), so deleting a user
frees their address for re-use. A plain unique index would reserve it forever,
which is indistinguishable from a bug to whoever tries to re-create the account.
The cost is that `ON CONFLICT` statements must repeat the predicate for Postgres
to infer the index — see `targetWhere` in `packages/db/src/seed.ts`.

**A changed password or role revokes the user's sessions** too. The access token
carries `role`, so its bearer keeps whatever claims it was minted with; forcing a
fresh login is the only way to reissue them.

Two things the API refuses on principle: deleting your own account, and demoting
yourself. Both are one-way doors — once it lands you can no longer reach the
endpoint to undo it, and if you were the last admin, nobody can.

The console lives at `/users` and is gated with `notFound()` for non-admins: the
API is admin-only, so for anyone else the route may as well not exist, and a table
that answers 403 to every request only looks broken.

## Styling

Each app owns its own global stylesheet — `apps/admin-app/src/app/globals.css`.
`packages/ui` deliberately ships **no CSS at all**: a stylesheet in a library is
global state, so importing one component would drag in a base layer and a whole
token set, and every app would be stuck with the same palette. The package exports
only components that _consume_ the variables; the variable **names** are the
contract, the **values** belong to the app.

Two consequences worth knowing:

- Tailwind v4 scans from the importing file, so the app's `globals.css` has an
  explicit `@source` pointing at `packages/ui/src`. Without it every class used
  only inside a shared component is dropped from the build.
- `pnpm ui-add` writes components into `packages/ui` but injects new theme
  variables into the admin app's `globals.css` (that path is what
  `packages/ui/components.json` points at). Adding a second app means copying the
  new variables into its stylesheet too.

Dark mode is next-themes with `attribute="class"`, which pairs with the
`@custom-variant dark (&:is(.dark *))` line in `globals.css` — change one and you
must change the other. `<html>` carries `suppressHydrationWarning` because
next-themes writes the class before React hydrates.

## App shell

Everything signed-in renders inside the `(app)` route group:

```
src/app/(app)/layout.tsx              sidebar + header + footer, and the session gate
src/components/layout/                app-sidebar, app-header, app-footer, nav-user
src/components/layout/nav-config.ts   the navigation, as data
src/components/common/                app-brand, mode-toggle, locale-switcher
```

- **The session is enforced once**, in `(app)/layout.tsx`, rather than in each
  page. `getServerSession()` is wrapped in React `cache()`, so a page that also
  needs the user shares the layout's single `/auth/me` round trip.
- **Navigation is data** in `nav-config.ts`, shared by the sidebar and the header
  breadcrumb so the two cannot disagree about the current page's name. Adding a
  page is one entry. It is declared `as const satisfies` so `labelKey` keeps its
  literal type — widening it to `string` would defeat the typed-message setup.
- **Signing out lives in the sidebar footer** (`nav-user.tsx`), because it has to
  be reachable from every route, and the sidebar is the one region always present.
- The collapsed/expanded state is read from the `sidebar_state` cookie on the
  server so the first paint is already correct instead of flashing open.

## Internationalisation

next-intl, with the locale in a **cookie rather than the URL**. This is an admin
console behind a login: nothing here is crawled or shared, so a `/en/…` segment
would buy no SEO while forcing a rewrite of every link, redirect, and `proxy.ts`
guard. Routing is left completely untouched.

```
messages/en.json, messages/ar.json   the catalogues (en is the source of truth)
src/i18n/config.ts                   locales, direction, cookie name
src/i18n/request.ts                  resolves locale + messages per render
src/i18n/actions.ts                  setLocale server action
src/global.d.ts                      makes message keys type-checked
```

- **English is the source of truth.** `src/global.d.ts` types `Messages` from
  `en.json`, so `t("Nav.dashbord")` is a build error rather than a string a user
  sees. Keep the two catalogues key-identical.
- **Switching locale is a server action**, not a client-side cookie write: the
  locale is read during the _server_ render, so the caller follows `setLocale()`
  with `router.refresh()`. Writing the cookie in the browser would leave the
  already-rendered server components in the old language until a hard reload.
- **An unknown cookie value falls back** to the default instead of throwing. The
  cookie is user-writable, and `request.ts` imports the catalogue by interpolating
  the locale into the path — the `isLocale()` guard is what keeps that from being
  an arbitrary-path read.
- **Arabic is RTL.** `<html dir>` is set from the locale, and Radix's
  `DirectionProvider` is mounted so its primitives position and key-navigate
  correctly. Radix and the sidebar accept only _physical_ sides, so components that
  should follow the reading order resolve `useDirection()` into `left`/`right`
  themselves. Identifiers, emails and phone numbers carry `dir="ltr"` so the bidi
  algorithm does not reorder them.
- Prefer logical utilities (`ms-*`, `ps-*`, `text-start`) over `ml-*`/`text-left`
  in new UI — they flip on their own.

## Conventions in `admin-app`

- **Server state lives in `src/services/<resource>/`** — one folder per resource,
  one file per hook, each exporting its own raw axios call beside it so a server
  component or a script can reuse the call without pulling in React Query. Shared
  shapes go in that folder's `types.ts` (`services/users/types.ts`); a type only
  one hook uses stays in the hook's file.

  ```
  services/auth/    use-session.ts, use-login.ts, use-logout.ts
  services/users/   types.ts, use-users.ts, use-user.ts,
                    use-create-user.ts, use-update-user.ts, use-delete-user.ts
  ```

  Hooks live here rather than beside the page that first needed them: `useLogin`
  isn't owned by the login page — a re-auth prompt may need it too.

- **Route-only code colocates** in `_components/` and `_lib/` next to `page.tsx`.
  The `_` prefix makes them Next.js private folders, excluded from routing.
- **No user-facing string is hard-coded.** Wording goes in `messages/*.json`;
  brand values go in `@repo/white-label`. Zod schemas take already-translated
  strings (see `login/_lib/schemas.ts`) so validation messages follow the locale
  without the schema knowing anything about i18n.

## Environment

All variables live in one root `.env` (see `.env.example`). Both apps validate at
boot and refuse to start on a bad value — the backend with class-validator
(`apps/backend/src/config/env.ts`), the admin app with `@t3-oss/env-nextjs`
(`apps/admin-app/src/env.ts`).
