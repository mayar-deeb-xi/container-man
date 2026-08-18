import "server-only";

import { cache } from "react";

import type { AppAbility } from "@repo/access";
import { createAppAbility, createEmptyAbility } from "@repo/access";

import { getServerSession } from "~/lib/session";

/**
 * The signed-in user's ability, for server components.
 *
 * Built from the rules `/auth/me` returned, which is the same array the backend's
 * guards resolve — so a page that hides itself and the API that would refuse it are
 * deciding from one source. Anything the client-side provider does with `<Can>`, this
 * is the server-render equivalent of.
 *
 * `cache()` for the same reason `getServerSession` uses it: the layout gate, a page
 * and a nav filter all ask within one render, and building the ability three times
 * from identical rules would be three passes over the same list.
 *
 * A signed-out render gets an ability that permits nothing rather than a null — every
 * call site would otherwise need a guard, and the permissive version of that guard is
 * the one that gets written by accident.
 */
export const getServerAbility = cache(async (): Promise<AppAbility> => {
  const session = await getServerSession();
  return session ? createAppAbility(session.rules) : createEmptyAbility();
});
