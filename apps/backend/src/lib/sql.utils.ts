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
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "23505"
  );
}
