import type { Container } from "~/services/containers/types";

/**
 * Whether a box's CSC examination has passed or is close.
 *
 * The same 30-day window the API's `inspectionDue` filter uses, restated here because the
 * table also has to *mark* the rows it returns — a filter that finds them and a badge that
 * highlights them would otherwise disagree about the boundary.
 */
export const INSPECTION_WINDOW_DAYS = 30;

export type InspectionState = "overdue" | "due" | "ok" | "unknown";

/**
 * Compared as `YYYY-MM-DD` strings rather than as `Date`s.
 *
 * The column is a date, and parsing it into a `Date` attaches the browser's timezone —
 * enough to move a deadline across a day boundary, which is how a box in Auckland reads as
 * overdue in Los Angeles. String comparison on an ISO date is exact and needs no zone.
 */
export function inspectionState(container: Container, today: string): InspectionState {
  if (!container.nextInspectionOn) return "unknown";
  if (container.nextInspectionOn < today) return "overdue";

  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + INSPECTION_WINDOW_DAYS);
  return container.nextInspectionOn <= limit.toISOString().slice(0, 10) ? "due" : "ok";
}

/** Today in UTC as `YYYY-MM-DD`, so the comparison above has a stable reference. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `1,000 kg` in the caller's locale — weights are the one thing this table is full of. */
export function formatKg(value: number, locale: string): string {
  return `${new Intl.NumberFormat(locale).format(value)} kg`;
}
