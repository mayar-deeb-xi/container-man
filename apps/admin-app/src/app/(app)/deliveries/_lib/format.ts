import type { DeliveryStatus } from "@repo/goods-in";

/**
 * A `YYYY-MM-DD` column as a `Date` pinned to UTC, for `format.dateTime(..., {
 * timeZone: "UTC" })` — the same trick the containers table uses so the server and
 * client renders agree and no browser timezone moves the day.
 */
export function utcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/**
 * Two states, two looks: a draft is work in progress and reads quiet; a signed record
 * is the finished thing the register exists for.
 */
export function statusVariant(status: DeliveryStatus): "default" | "secondary" {
  return status === "signed" ? "default" : "secondary";
}
