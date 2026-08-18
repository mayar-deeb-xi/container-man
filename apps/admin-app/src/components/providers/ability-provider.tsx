"use client";

import { createContext, useContext, useMemo } from "react";

import type { AppAbility, AppResourceSubject } from "@repo/access";
import { createAppAbility, createEmptyAbility, FIELD_SCOPED_ACTION } from "@repo/access";

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

/**
 * Which fields of one record the user may write — for greying out the inputs they cannot.
 *
 * Returns a predicate rather than a list because that is how a form asks: one control at a
 * time, beside the field it belongs to. A rule with no `fields` permits every field, so the
 * unrestricted case answers `true` throughout and no form needs a special path for it.
 *
 * `record` is the row being edited, and it is required for the same reason the API loads the
 * row before checking: a rule can be conditional, and "may set the status of the containers
 * assigned to you" is a question about a particular box. Passing nothing means there is no
 * row yet — a create — which is never field-checked, so everything is writable. The API is
 * where that is decided; this only decides what the form offers.
 *
 * The two field names that are not columns work here too: `useFieldAccess("User", user)("roles")`
 * is what gates the role assignment card, and `("Role", role)("permissions")` the matrix.
 */
export function useFieldAccess(
  subject: AppResourceSubject,
  // `object`, not `Record<string, unknown>`: the records passed here are the API's entity
  // types, and an interface without an index signature is not assignable to that.
  record?: object | null,
): (field: string) => boolean {
  const ability = useAbility();

  return useMemo(() => {
    if (!record) return () => true;

    // Tagged as a copy rather than with `asSubject`, which defines the marker on the object
    // it is given: these are records owned by the query cache, and marking them in place
    // would outlive this render.
    const tagged = { ...record, __caslSubjectType__: subject } as never;

    return (field: string) => ability.can(FIELD_SCOPED_ACTION, tagged, field);
  }, [ability, record, subject]);
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
