import type { ContainerSizeFt, ContainerType } from "./vocabulary";

/**
 * The numbers stamped on a container's CSC plate, and the arithmetic between them.
 *
 * Tare and max gross are the two the plate carries; payload is the difference. Storing
 * payload as a third column would let the three disagree, and a container whose stored
 * payload does not match its plate is worse than one with no payload recorded at all — so
 * it is derived, here, once.
 */

export const MAX_TARE_KG = 10_000;
export const MAX_GROSS_KG = 40_000;

/** Max cargo weight: what is left of the gross once the box itself is accounted for. */
export function payloadKg(tareWeightKg: number, maxGrossWeightKg: number): number {
  return maxGrossWeightKg - tareWeightKg;
}

/**
 * Typical plate figures per size, used to prefill the form.
 *
 * Suggestions only — real boxes vary by builder and by age, and the operator is copying
 * from a plate in front of them. Offering a starting point beats an empty field; refusing
 * anything that differs from these would be refusing reality.
 */
export const TYPICAL_PLATE: Record<
  ContainerSizeFt,
  { tareWeightKg: number; maxGrossWeightKg: number }
> = {
  20: { tareWeightKg: 2_200, maxGrossWeightKg: 30_480 },
  40: { tareWeightKg: 3_800, maxGrossWeightKg: 32_500 },
  45: { tareWeightKg: 4_800, maxGrossWeightKg: 34_000 },
};

/** Typical internal volume per size and type, for the same reason. */
export function typicalCapacityM3(sizeFt: ContainerSizeFt, type: ContainerType): number {
  if (sizeFt === 20) return type === "reefer" ? 28.3 : 33.2;
  if (sizeFt === 40) return type === "high_cube" ? 76.4 : type === "reefer" ? 67.3 : 67.7;
  return 86.0;
}
