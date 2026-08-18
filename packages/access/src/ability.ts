import type { ForcedSubject, MongoAbility } from "@casl/ability";
import { createMongoAbility, subject as tagSubject } from "@casl/ability";

import type { AppRule } from "./rules";
import type { AppAction, AppSubject } from "./vocabulary";

/** A subject name that can carry an instance — everything except the `all` wildcard. */
export type AppResourceSubject = Exclude<AppSubject, "all">;

/**
 * A record tagged with the subject it represents, as `asSubject` produces.
 *
 * The ability has to accept both this and a bare subject name, because the two questions
 * are different: `can("update", "User")` asks whether the caller may update users at all
 * — what a route guard can know — while `can("update", asSubject("User", row))` asks
 * about that row, which is the only form a rule's conditions can answer.
 */
export type AppSubjectInstance = ForcedSubject<AppResourceSubject>;

export type AppSubjects = AppSubject | AppSubjectInstance;

/**
 * The ability type both sides check against. `MongoAbility` is the flavour whose
 * conditions are MongoDB-style queries, which is what makes a stored `conditions`
 * object executable without compiling anything.
 */
export type AppAbility = MongoAbility<[AppAction, AppSubjects]>;

/**
 * Builds an ability from already-resolved rules.
 *
 * Takes rules rather than a user on purpose: the backend resolves them from the
 * database and the browser receives the same array over the wire from `/auth/me`,
 * so both construct the *same* ability from the *same* input. Anything asymmetric
 * here — a rule the server adds implicitly, a default the client assumes — is a UI
 * that disagrees with the API about what a button will do.
 */
export function createAppAbility(rules: readonly AppRule[]): AppAbility {
  // Cast because CASL types `RawRuleFrom` with its own generics; `AppRule` is that
  // shape by construction, and keeping our own interface is what lets the wire
  // format be documented in one place.
  return createMongoAbility<[AppAction, AppSubjects]>(rules as never);
}

/**
 * An ability that permits nothing — the honest answer for a signed-out render.
 *
 * Without it, code with no rules to hand would reach for `undefined` and every
 * `can()` call site would need a null check, which is the kind of check that gets
 * written as `ability?.can(…) ?? true` under deadline.
 */
export function createEmptyAbility(): AppAbility {
  return createAppAbility([]);
}

/**
 * Tags a plain object with the subject it represents, so a rule's conditions can be
 * matched against it.
 *
 * Required because these objects are database rows and JSON — they have no class for
 * CASL to infer a subject type from, so `can("update", row)` would ask about a subject
 * called "Object" and match nothing. Wrapping it is what turns a route-level "may update
 * some user" into "may update *this* user".
 *
 * Re-exported through this package rather than imported from `@casl/ability` at each
 * call site: the subject names are this package's vocabulary, and keeping the tagging
 * beside them means the two cannot be paired wrongly.
 */
export function asSubject<T extends object>(
  type: AppResourceSubject,
  object: T,
): T & ForcedSubject<AppResourceSubject> {
  return tagSubject(type, object as T & Record<PropertyKey, unknown>);
}
