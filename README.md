# container-man

A Turborepo monorepo: a Next.js admin console backed by a NestJS API, with
PostgreSQL + Drizzle and cookie-based JWT auth.

## Stack

| Layer    | Choice                                                          |
| -------- | --------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), shadcn/ui, Tailwind v4                 |
| Theming  | next-themes, class-based dark mode                              |
| i18n     | next-intl 4, cookie-based locale, English + Arabic (RTL)        |
| Forms    | react-hook-form + Zod (`zodResolver`)                           |
| Data     | axios + TanStack React Query                                    |
| Backend  | NestJS 11, class-validator DTOs                                 |
| Database | PostgreSQL 17 + Drizzle ORM                                     |
| Cache    | Redis 8 — optional; with no `REDIS_URL` the app runs without it |
| Auth     | JWT access + refresh tokens in httpOnly cookies, with rotation  |
| Access   | CASL abilities from database-backed roles and permissions       |
| Domain   | Shipping containers: ISO 6346 identity, CSC plate, survey dates |

## Layout

```
apps/
  admin-app/     Next.js admin console (port 3000)
  backend/       NestJS API (port 3001)
packages/
  access/        CASL vocabulary, rule format, ability builder, system roles
  auth/          JWT signing/verification, password hashing, cookie contract
  cache/         Optional Redis client, connection lifecycle, key namespacing
  db/            Drizzle schema, client, migrations, seed
  shipping/      Container vocabulary, ISO 6346 check digit, CSC plate arithmetic
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
modules/roles/, modules/permissions/, modules/containers/
guards/                         JwtAccessGuard, JwtRefreshGuard, AbilityGuard
decorators/                     CurrentUser, RequireAbility, CurrentAbility
lib/                            response envelope, pagination query, Drizzle, ability and Redis providers
config/                         env validation and the typed AppConfigService
```

Guards and decorators are deliberately outside `modules/`: every module reaches for
them, and leaving them inside the one that happened to need them first makes every
later import read as a dependency on that feature.

`packages/auth` is shared because the backend and the admin app's `proxy.ts` both
need the same cookie names, TTLs, and token handling — keeping them in one place
is what stops the two from drifting apart. `packages/access` is shared for the same
kind of reason: the backend's guards and the console's `<Can>` must build the _same_
CASL ability from the _same_ rules, and a mirrored copy that drifted would mean a UI
that offers buttons the API refuses. `packages/db` is used by the **backend only**;
the admin app talks to the API and never to Postgres.

`packages/shipping` is shared for the third variation on the same theme: the container
vocabulary backs a database enum, a DTO validator and a console filter, and the ISO 6346
check digit has to be computed identically by the form and the API. A max-length constant
duplicated by hand is a nuisance; an algorithm duplicated by hand is a bug waiting for a
transposed digit.

`packages/white-label` holds _what_ an app is called and _where_ its links point,
never _how_ anything is worded — wording is translated, so it lives in each app's
`messages/*.json`. A link there carries a translation key rather than a label.

## Getting started

```bash
pnpm install
cp .env.example .env      # a single .env at the root serves every workspace
pnpm dev:db               # start Postgres (and Redis) in Docker
pnpm db:migrate           # apply migrations
pnpm db:seed              # catalog + system roles + admin (+ demo data outside prod)
pnpm dev                  # admin-app on :3000, backend on :3001
```

Sign in at http://localhost:3000/login with the credentials printed by
`pnpm db:seed` (default `admin@example.com` / `password123`).

### Demo accounts

Outside production, `pnpm db:seed` also creates roles and accounts to exercise
authorization with — all sharing `SEED_DEMO_PASSWORD` (default `password123`):

| Account                       | Roles            | What it is for                                              |
| ----------------------------- | ---------------- | ----------------------------------------------------------- |
| `alex.admin@example.com`      | admin            | A **second** administrator                                  |
| `olivia.operator@example.com` | operator         | `manage Container` — the wildcard standing in for all verbs |
| `victor.viewer@example.com`   | viewer           | The narrowest useful role: one grant                        |
| `audrey.auditor@example.com`  | auditor + viewer | Two roles, so abilities are their union                     |
| `maya.manager@example.com`    | user-manager     | Creates accounts but **cannot** assign roles                |
| `noah.newcomer@example.com`   | —                | Signs in and can reach nothing                              |

The second administrator is the load-bearing one: the API refuses to let anyone edit
their own roles or delete their own account, so without a second admin there is no way to
exercise the role editor or the delete flow at all. `maya` is the other one worth knowing
— `PUT /users/:id/roles` requires `update Role` as well as `update User`, so a role that
administers accounts cannot hand out privilege. That refusal is the point.

Re-running the seed restores this set, undeleting any of them you deleted through the
console. It is skipped when `NODE_ENV=production`, where a shared published password has
no business existing; `SEED_DEMO` overrides the default either way, and
`removeDemo()` in `packages/db/src/seeds/demo.ts` takes the whole set back out.

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
| `pnpm db:seed`     | Catalog, system roles, admin, and demo data       |
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

**The access token carries identity only** — `sub`, `email`, `sid`. No role, no
packed rules. A token is valid for fifteen minutes and authorization cannot be: a
claim about what the bearer may do would keep granting it for that long after the
grant was revoked. What a user may do is resolved from the database on every request
that needs it, which is what makes a role change take effect on the next call rather
than at the next login. See **Authorization** below.

**Cookie scope.** Works out of the box on localhost because ports are not part of
a "site". In production, web and API must share a registrable domain — set
`COOKIE_DOMAIN=.example.com` and `COOKIE_SECURE=true`. If they must live on
genuinely different domains, set `COOKIE_SAMESITE=none` (which requires
`COOKIE_SECURE=true`).

## Authorization

Permissions are data. A user holds any number of **roles**, a role grants any number
of **permissions**, and a permission is an (action, subject) pair — the vocabulary
CASL evaluates. The three tables plus the two joins are the whole model:

```
users ──< user_roles >── roles ──< role_permissions >── permissions
```

**The vocabulary lives in `packages/access`**, not in the database: `ACTIONS`
(`manage`, `create`, `read`, `update`, `delete`), `SUBJECTS` (`all`, `User`,
`Role`, `Container`), and the `PERMISSION_CATALOG` of pairs that may be granted.
`manage` and `all` are CASL's wildcards, so `manage all` is a superuser. The
`permissions` table is a _projection_ of that catalog, reconciled by `pnpm db:seed`
in both directions — a pair added in code appears as a row, one removed takes its
grants with it. The catalog can therefore lead the API safely: a pair nothing checks
simply grants nothing.

**A stored rule is a CASL rule.** `role_permissions` carries `conditions` (a
MongoDB-style query matched against the record), `fields`, `inverted` and `reason`
alongside the pair — so "set the status of the containers assigned to you, and nothing
else about them" is one row, not a special case in code. Conditions may reference the
signed-in user through `${user.id}` and `${user.email}`, resolved per request; the
placeholder list is closed and writes are validated against it, because a rule whose
placeholder resolves to nothing would grant nothing while looking granted. The operator
allowlist is enforced for the same reason, and it is exactly the set `createAppAbility`
can evaluate — which is why `packages/access` registers MongoDB's `$and`, `$or`, `$nor`
and `$not` with the matcher. CASL's default omits them, and an unsupported operator does
not raise: it parses as a comparison against a field of that name and matches nothing.

**`conditions` says which records; `fields` says which columns.** A condition is matched
against the record, so `{"assignedToId": "${user.id}"}` means "the containers assigned to
you" — and a rule with _no_ condition covers every row, which matters when roles are
combined: allows are unioned, so a single unconditional grant in any role a user holds
widens all of them. Narrowing back down is what `inverted` is for. `fields` is enforced on
**writes only**. A PATCH names the columns it touches, so refusing the ones a rule does not
cover is exact and the refusal says which; filtering columns out of a _response_ would mean
rendering tables with holes in them, and "which records may be read" is already what
`conditions` expresses. Because no other action is field-checked, the API refuses to store
`fields` on one — `manage` included, since it covers reads and deletes too. Two field names
are not body keys at all: `User.roles` and `Role.permissions` name the endpoints that hand
out privilege, so `update Role` limited to `["name", "description"]` is "may tidy up the
role list, may not change what anybody can do".

**Nothing is cached.** `AbilityService` reads roles and rules on every guarded
request — two indexed queries — and builds the ability from them. That is the point:
an operator who revokes a role expects it to be revoked, and every copy of the rules
(a JWT claim, a process-local map) is a window in which it is not.

**An overlap is resolved by order, so denies are sorted last.** CASL takes the last
matching rule — not the inverted one, whatever is intuitive. A single role cannot hold both
halves of a contradiction (the composite primary key forbids it), but two roles one user
holds can, so `AbilityService` orders inverted rules to the end as it resolves them. A deny
then beats every allow it overlaps regardless of which role contributed it, and "everyone
may update containers, except nobody touches a retired one" is a broad allow plus one
inverted rule.

**List queries push conditions into SQL and are still filtered row by row.**
`abilityWhere` compiles what it can into a `WHERE` clause under a single invariant: the
predicate may admit rows the rules forbid, but must never exclude one they allow. A second
evaluator will differ from `@ucast/mongo2js` somewhere — three-valued logic over `NULL`,
JS coercing `null` to `0` in a comparison, regex dialects — and allowed to differ in only
that direction, the difference costs I/O rather than leaking a row, because the ability is
applied to every row afterwards and has the last word. Anything untranslatable therefore
widens: a clause drops out of an `AND`, a branch discards its whole `OR`, a rule abandons
the push-down, and a value whose type the column would reject is left in memory. What this
buys is a truthful list — `pagination.total` counts what the caller can see and a page
comes back full, where before `LIMIT` was applied to rows the filter then removed, so a
conditional reader got an over-count above a short page and could be handed an empty first
page. It over-counts only where a rule does not translate.

**Endpoints** — `GET /roles`, `GET /roles/:id`, `POST /roles`, `PATCH /roles/:id`,
`PUT /roles/:id/permissions`, `DELETE /roles/:id`, and `GET /permissions` for the
catalog. Assignment is `GET`/`PUT /users/:id/roles`, and `GET /users/:id/rules`
returns the effective rule set the console displays.

The two `PUT`s replace a whole set rather than amending one. The editors know every
checkbox's state, so "the list I sent is now the list" is the only reading that
cannot half-apply — and it keeps an omitted field from meaning something different to
an empty array.

**Guarding a route** is `@RequireAbility({ action, subject })` plus `AbilityGuard`,
listed after `JwtAccessGuard` because it reads the payload that guard attaches.
Several requirements are ANDed: `PUT /users/:id/roles` needs `update User` **and**
`update Role`, since handing out roles is how privilege is granted — without the
second, someone who may only rename accounts could promote a colleague. A route-level
check cannot test conditions (there is no record yet), so where ownership matters the
handler re-checks with `@CurrentAbility()` against the row it loaded — and where a rule may
be narrowed to certain columns, `assertFieldsAllowed` puts the body's own keys to it. Both
are per-record on purpose: a rule's conditions and its fields have to be evaluated against
the same object, or either could be satisfied by the wrong one.

**What the API refuses, and why.** Each of these is a door that cannot be reopened
from the other side:

- **Editing your own roles.** `update User` is itself a permission, so the moment it
  lands you may no longer be able to reach the endpoint to undo it.
- **Deleting your own account.**
- **Removing the last `admin`** — by assignment or by deletion. An install with no
  administrator cannot be administered, and no endpoint can repair it.
- **Editing the `admin` role's permissions.** Its `manage all` lives in
  `SYSTEM_ROLES`, in code. A matrix that can strip the last full-access grant is a
  console that can lock everyone out in two clicks.
- **Deleting a system role**, or renaming its `key`. The key is what code refers to;
  the display name stays editable.
- **Deleting a role a live account still holds.** The foreign key would cascade it
  away happily, which is the problem — it would silently strip permissions from
  everyone holding it. Reassigning first turns an invisible side effect into a
  decision. Soft-deleted users are excluded from that count: their assignments stay
  in place so undeleting restores what they had, but blocking a role on an account
  nobody can see would be a refusal no operator could clear.

**The console.** `/roles` lists roles with how much each grants and how many people
hold it; `/roles/[id]` is the permission matrix — every action against every subject, as
a grid of checkboxes. Ticking a box grants that action on the whole resource. `/users/[id]`
assigns roles to one person and shows, beside it, the effective rules those roles resolve
to — fetched from the API rather than unioned in the browser, so what is displayed is what
will be enforced.

**Narrowing a grant** happens under the grid, in **Rule details**: one panel per granted
cell, with the condition as JSON, the field limit, the denial switch and its reason. The
grid stays the answer to "what can this role do?" and the panel is where a yes becomes a
qualified yes — so the whole section is **folded by default**, the way an "advanced" block
is. Ticking a box is the errand most people arrive with, and a Mongo-style query is not
something to put in their way.

Folding hides nothing, though. The closed header counts the rules that are narrowed, and a
save that fails on a condition unfolds the section _and_ the panel holding it — "some rules
could not be saved" is not actionable while the reason is out of sight. Which panels are
open is state in the component rather than each `Collapsible`'s own, because the content
unmounts when the section closes: uncontrolled panels would quietly lose your place every
time it folded. Two more things are deliberate:

- **The field limit is a set of chips, not a text box**, drawn from `WRITABLE_FIELDS` for
  that subject. A typed field name is the one mistake that cannot be seen afterwards:
  `"despot"` does not restrict a rule to the depot, it restricts it to a field no request
  will ever name — which revokes the grant while looking like a narrowing. The API rejects
  it too; the console simply never offers it.
- **It only appears on `update` rules.** No other action is field-checked, so on a `read`
  or `create` cell the control is absent rather than disabled — and `manage` is excluded
  for the same reason, since it covers the actions that would ignore it.

A cell also carries its own marker in the grid: a denial reads as **Deny** under the
checkbox (it is a rule, so the box _is_ ticked, and an unlabelled tick would read as
"allowed"), and a rule narrowed by conditions or fields carries a dot.

**The console greys out what the API would refuse.** `useFieldAccess(subject, record)`
answers per field, against the record being edited, so a rule limited to
`["status", "depot"]` leaves those two inputs live and disables the other fifteen with one
line saying why — rather than letting someone fill in a plate weight and meet a 403 on
save. It reaches the two non-column fields as well: without `roles` the assignment card on
`/users/[id]` explains itself instead of saving, and without `permissions` the matrix
renders read-only. On a create form everything is writable, because a create has no record
for a condition to match and is not field-checked. None of it is a boundary — every one of
those writes is checked again by the API.

`/auth/me` returns the user's roles **and** their resolved rules, and
`AbilityProvider` builds the client ability from them. `<Can I="update" a="Role">`
hides a control; `getServerAbility()` is the server-component equivalent and gates
whole pages with `notFound()`. Because the rules ride on the session query the UI
already keeps fresh, a revoked role reaches every guarded control on the next refetch.
None of it is a security boundary — every action behind it is checked again by the
guards.

## User management

**Endpoints** — `GET /users`, `GET /users/:id`, `POST /users`, `PATCH /users/:id`,
`DELETE /users/:id`, plus the role routes above. Each is gated by the matching
ability, not by a role: the controller declares `read User` so a route added later is
gated by default, and every write narrows it to the action it performs. A role granted
only `read User` therefore gets a working, read-only console rather than a table that
403s on every request.

**Listing** is `skip`/`take`, named to match the `pagination` half of the response
envelope so a client can page by echoing what it was last given. `search` matches
email and name case-insensitively; `roleKey` filters to holders of one role — by key
rather than id, because it is a query string an operator can read and bookmark. Each
row carries the roles its user holds, fetched in one extra query for the whole page
rather than one per row. `take` is capped at 100.

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
to infer the index — see `targetWhere` in `packages/db/src/seeds/users.ts`.

**A changed password revokes the user's sessions.** Roles no longer do, and no longer
need to: the token carries no authorization, so a permission change is live on the
user's next request. A password change still has to invalidate the sessions holding
the old one.

Roles are **not** part of `PATCH /users/:id`. Replacing a set has one sensible verb,
and keeping it separate puts the self-lockout check in exactly one place. The create
endpoint does accept `roleIds`, since a brand-new account can be neither your own nor
the last administrator.

## Containers

A container here is a **shipping container** — a steel box — so the columns are the ones
stamped on it and the ones a yard needs to answer about it.

**Identity is ISO 6346.** Eleven characters: a three-letter owner code, a category letter
(`U`, `J` or `Z`), a six-digit serial, and a **check digit** computed from the other ten.
`packages/shipping` implements that computation, and both the form and the DTO validate
against it. This is the rule worth having on both sides: a number is copied by hand off a
door, and a check digit catches the transposition that a length-and-pattern check waves
through. Numbers are normalized on the way in — `mscu 123456-5` and `MSCU1234565` are the
same box, and the column holds one spelling of it.

**Weights come off the CSC plate.** `tare_weight_kg` and `max_gross_weight_kg` are what is
stamped there; **payload is derived**, not stored, because a third column could disagree
with the plate. The API sends it, computed once in `@repo/shipping`, rather than leaving
every client to subtract — and to round — for itself.

**Two axes that look like one.** `status` is operational (`available`, `allocated`,
`loaded`, `in_transit`, `at_port`, `under_repair`, `damaged`, `retired`) and `condition` is
survey grade (`new`, `cargo_worthy`, `wind_water_tight`, `damaged`). A box can be grade C
and in transit, which is exactly the combination a fleet desk goes looking for.

**`retired` is not a delete.** A scrapped box keeps its number and stays in the fleet list
where its history resolves. Deleting is a soft delete for a row that should not have
existed — and because the number index is partial, deleting frees the number to be entered
again.

**Reefer fields are refused elsewhere.** `reefer_setpoint_c` only applies to a `reefer`; the
API rejects it on any other type, and converting a box away from reefer clears it. A dry
container with -18°C recorded against it is how a fleet report ends up lying, and nothing
downstream would flag it.

**Dates are dates.** `manufactured_on` and `next_inspection_on` are `date` columns carried
as `YYYY-MM-DD` end to end, and compared as strings. A timestamp would invite a timezone to
move a CSC deadline across a day boundary — enough for a box in Auckland to read as overdue
in Los Angeles.

**Endpoints** — `GET /containers`, `GET /containers/:id`, `POST /containers`,
`PATCH /containers/:id`, `DELETE /containers/:id`, each gated by the matching
`Container` ability. Listing is `skip`/`take` ordered by container number — a register is
read by number, not by what was added last — with `search` (number, operator, depot),
`status`, `type`, `condition`, `sizeFt`, `assignedToId` (a user id or `unassigned`) and
`inspectionDue`, which is the one filter that is a question rather than a column: survey
passed or due within 30 days.

**`assigned_to_id` is what makes ownership rules real.** It is the _console account_
responsible for a box — deliberately not the industry's "owner", which is the leasing
company encoded in the number's owner code. A role granted `update Container` with
conditions `{ "assignedToId": "${user.id}" }` can edit only its own boxes, enforced by the
service against the row it loaded and reflected in the console, where the row's actions
menu appears only on the boxes that rule allows. Adding `fields: ["status", "depot"]` to the
same rule narrows it again — a clerk who moves boxes around the yard without re-plating them
— and a PATCH touching anything else is refused by the column it named.

That last part has a requirement worth stating: **any column a condition may reference has
to be exposed by the API.** `assignedToId` is sent alongside the resolved `assignedTo`
object for exactly that reason — without it the same rule would be enforced by the backend
and unevaluable in the browser, so every guarded control would hide itself on a box the API
would happily allow.

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
  services/auth/        use-session.ts, use-login.ts, use-logout.ts
  services/users/       types.ts, use-users.ts, use-user.ts,
                        use-create-user.ts, use-update-user.ts, use-delete-user.ts,
                        use-user-roles.ts, use-user-rules.ts
  services/roles/       types.ts, use-roles.ts, use-role.ts, use-create-role.ts,
                        use-update-role.ts, use-set-role-permissions.ts,
                        use-delete-role.ts
  services/permissions/ types.ts, use-permissions.ts
  ```

  Hooks live here rather than beside the page that first needed them: `useLogin`
  isn't owned by the login page — a re-auth prompt may need it too.

- **Route-only code colocates** in `_components/` and `_lib/` next to `page.tsx`.
  The `_` prefix makes them Next.js private folders, excluded from routing.
- **No user-facing string is hard-coded.** Wording goes in `messages/*.json`;
  brand values go in `@repo/white-label`. Zod schemas take already-translated
  strings (see `login/_lib/schemas.ts`) so validation messages follow the locale
  without the schema knowing anything about i18n.

## Cache

Redis is **optional**, and the app is written so that it stays optional. `packages/cache`
owns the client — one memoized connection, a bounded reconnect strategy, and every key
namespaced through `cacheKey()` so several environments can share one instance.
`RedisService` (`apps/backend/src/lib/redis/`) is the only thing the backend talks to;
`RedisModule` is global, so any feature module can inject it.

With no `REDIS_URL` there is no client at all. When one is configured but unreachable,
the service logs a single warning at boot and keeps serving: reads report a miss, writes
are dropped, and `wrap()` just calls its loader. A cache outage degrades throughput,
never correctness — which is the property that lets a cached read be added to a hot
path without adding a new way for it to fail.

```ts
constructor(private readonly cache: RedisService) {}

// read-through; with no cache this is exactly `loadContainer(id)`
const container = await this.cache.wrap(this.cache.key("containers", id), 60, () =>
  this.loadContainer(id),
);

// invalidate one entry, or a whole group, after a write
await this.cache.del(this.cache.key("containers", id));
await this.cache.delByPattern(`${this.cache.key("containers")}:*`);
```

Nothing is cached yet — the service is wired up and waiting for the first call site.

## Environment

All variables live in one root `.env` (see `.env.example`). Both apps validate at
boot and refuse to start on a bad value — the backend with class-validator
(`apps/backend/src/config/env.ts`), the admin app with `@t3-oss/env-nextjs`
(`apps/admin-app/src/env.ts`).

`REDIS_URL` is the one variable whose absence is a valid configuration rather than a
mistake, so it is optional in the backend schema and in `packages/cache` — but a malformed
value still fails at boot rather than quietly leaving the cache off.
