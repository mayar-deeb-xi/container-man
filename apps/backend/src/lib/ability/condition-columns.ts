import type { Column } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";

import type { AppResourceSubject } from "@repo/access";
import { containers, roles, users } from "@repo/db";

/**
 * The columns a stored condition may match on, per subject.
 *
 * These are the same column objects the list queries hand to `abilityWhere`, which is
 * the point: a rule is validated at write time against exactly the table it will be
 * compiled against at query time, so "does this condition translate?" gets one answer
 * in both places. The keys are Drizzle's TypeScript property names (`assignedToId`,
 * not `assigned_to_id`) — the same names the in-memory evaluator sees on a selected row.
 *
 * `all` is deliberately absent. A condition on an `all` rule would have to compile
 * against every table at once, and a key that is a column of one subject is a typo on
 * another — so the API refuses to store conditions on `all` rules entirely, and the
 * wildcard stays what it is: unconditional.
 */
export const CONDITION_COLUMNS: Record<AppResourceSubject, Record<string, Column>> = {
  User: getTableColumns(users),
  Role: getTableColumns(roles),
  Container: getTableColumns(containers),
};
