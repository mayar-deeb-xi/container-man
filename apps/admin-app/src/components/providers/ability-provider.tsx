"use client";

import { createContext, useContext, useMemo } from "react";

import type { AppAbility } from "@repo/access";
import { createAppAbility, createEmptyAbility } from "@repo/access";

import type { AppAction, AppSubject, SessionUser } from "~/services/auth/types";
import { useSession } from "~/services/auth/use-session";

/**
 * Nothing-permitted rather than undefined, so a component rendered outside the
 * provider fails closed. A context default of `null` would push a null check into
 * every consumer, and the version of that check people write under deadline is the
 * one that treats "no ability yet" as "allowed".
 */
const AbilityContext = createContext<AppAbility>(createEmptyAbility());

/**
 * Publishes the signed-in user's CASL ability to the client tree.
 *
 * Seeded from the server render — the layout already has the session — then kept in
 * step by the same `useSession` query the sidebar and account card read. That is what
 * makes a revoked role reach the UI: the rules travel with the session, so when the
 * query refetches, every `<Can>` in the tree re-evaluates without a reload.
 *
 * The ability is memoized on the rules array, not rebuilt per render: CASL indexes
 * rules on construction, and `can()` is called once per guarded control on screen.
 */
export function AbilityProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const { data } = useSession();
  const rules = (data ?? user).rules;

  const ability = useMemo(() => createAppAbility(rules), [rules]);

  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}

/** The ability itself, for logic that needs more than showing or hiding a node. */
export function useAbility(): AppAbility {
  return useContext(AbilityContext);
}

/** One permission check, as a boolean — the common case. */
export function useCan(action: AppAction, subject: AppSubject): boolean {
  return useAbility().can(action, subject);
}

interface CanProps {
  /** The action, named `I` so the JSX reads `<Can I="update" a="Role">`. */
  I: AppAction;
  a: AppSubject;
  /**
   * A specific instance to test the rule's conditions against, for rules like "update
   * the containers you own". Pass the row, not its id: CASL matches the conditions
   * against the object's fields.
   */
  this?: Record<string, unknown>;
  children: React.ReactNode;
  /** Rendered instead when the check fails — usually nothing, sometimes an explanation. */
  fallback?: React.ReactNode;
}

/**
 * Renders its children only if the user may do the thing.
 *
 * Written here rather than pulled from `@casl/react`, which is thirty lines of
 * context wrapper declaring a peer range that stops at React 18 — this app is on 19.
 *
 * It hides controls; it does not secure anything. Every action behind it is checked
 * again by the backend's guards, which is where authorization actually happens.
 */
export function Can({
  I: action,
  a: subject,
  this: instance,
  children,
  fallback = null,
}: CanProps) {
  const ability = useAbility();

  // `subject()` from @casl/ability is not needed here: the instance is a plain object
  // from JSON, so the subject type has to be named explicitly anyway, and `can`
  // accepts the pair directly.
  const allowed = instance
    ? ability.can(action, { ...instance, __caslSubjectType__: subject } as never)
    : ability.can(action, subject);

  return <>{allowed ? children : fallback}</>;
}
