/**
 * Query helpers shared by the services. They started out private to
 * `UsersService`; roles need exactly the same two, and a second copy of either is a
 * second place for the reasoning below to be forgotten.
 */

/**
 * Escapes the wildcards Postgres' LIKE grammar reserves.
 *
 * Without this a search for `_` or `%` matches every row rather than the rows
 * containing that character — surprising, and a cheap way to make the query scan
 * the whole table.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Postgres' unique_violation. Reached only when a concurrent insert wins the race. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as { code?: string; cause?: unknown };
  if (candidate.code === "23505") return true;

  // Drizzle wraps driver errors in a DrizzleQueryError whose `cause` holds the actual
  // PostgresError — checking only the top level would let a duplicate key surface as a
  // 500 instead of the 409 every call site here promises.
  return candidate.cause !== undefined && isUniqueViolation(candidate.cause);
}
