/**
 * One file per table. Everything re-exported here is what drizzle-kit sees
 * (`drizzle.config.ts` points at this file) and what `db` is typed against, so a
 * new table only takes effect once it is listed below.
 */
export * from "./permissions";
export * from "./role-permissions";
export * from "./roles";
export * from "./sessions";
export * from "./user-roles";
export * from "./users";
