/**
 * What a shipping container *is*, as the console and the API both need to describe it.
 *
 * These lists are the vocabulary behind the database's enums, the DTO validators, and the
 * console's filters and selects. They live here for the same reason `@repo/access`'s
 * actions do: three hand-kept copies of "which statuses exist" is three chances for a
 * filter to silently match nothing.
 */

/**
 * Equipment types, in the words a yard uses.
 *
 * `dry` and `high_cube` are the same box in different heights, but they are quoted,
 * stacked and priced differently, so they are separate types rather than a height flag.
 * `reefer` is the one the API treats specially — it is the only type a temperature
 * setpoint means anything for.
 */
export const CONTAINER_TYPES = [
  "dry",
  "high_cube",
  "reefer",
  "open_top",
  "flat_rack",
  "tank",
  "ventilated",
  "platform",
] as const;

export type ContainerType = (typeof CONTAINER_TYPES)[number];

/** The type whose temperature fields are meaningful. */
export const REEFER_TYPE: ContainerType = "reefer";

/**
 * Nominal length in feet. 20 and 40 are the bulk of the world's fleet; 45 is the
 * high-cube pallet-wide box. Stored as a number so a list can sort by size rather than
 * alphabetically, where "40" would fall between "20" and "45" only by luck.
 */
export const CONTAINER_SIZES_FT = [20, 40, 45] as const;

export type ContainerSizeFt = (typeof CONTAINER_SIZES_FT)[number];

/**
 * Where the box is in its cycle.
 *
 * Deliberately operational rather than commercial — this is what a yard or fleet desk
 * asks ("can I use it?"), not what an invoice needs. `retired` is terminal: a scrapped
 * container keeps its number so history still resolves, which is also why deleting one is
 * a soft delete rather than a way to express the same thing.
 */
export const CONTAINER_STATUSES = [
  "available",
  "allocated",
  "loaded",
  "in_transit",
  "at_port",
  "under_repair",
  "damaged",
  "retired",
] as const;

export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

/** Statuses that mean the box cannot be allocated to a booking right now. */
export const UNAVAILABLE_STATUSES: readonly ContainerStatus[] = [
  "under_repair",
  "damaged",
  "retired",
];

/**
 * Survey grade, in the four buckets a depot actually reports.
 *
 * Not the same axis as `status`: a container can be grade `C` and still `in_transit`,
 * which is precisely the combination a fleet desk wants to find.
 */
export const CONTAINER_CONDITIONS = ["new", "cargo_worthy", "wind_water_tight", "damaged"] as const;

export type ContainerCondition = (typeof CONTAINER_CONDITIONS)[number];

/**
 * ISO size/type code — `22G1` for a 20ft general purpose box, `45R1` for a 40ft high-cube
 * reefer. Two characters of size, two of type, stamped on the door beside the number.
 *
 * Kept as free text with a pattern rather than an enum: there are hundreds of valid codes,
 * new ones are issued, and refusing an unfamiliar one would be refusing a real container.
 */
export const ISO_TYPE_CODE_PATTERN = /^[0-9A-Z]{4}$/;

/**
 * UN/LOCODE — five characters, two of country and three of place: `EGALY` is Alexandria,
 * `NLRTM` Rotterdam. The standard way to say *where* without free-typing a port name.
 */
export const UNLOCODE_PATTERN = /^[A-Z]{2}[A-Z2-9]{3}$/;

export function isContainerType(value: unknown): value is ContainerType {
  return typeof value === "string" && (CONTAINER_TYPES as readonly string[]).includes(value);
}

export function isContainerStatus(value: unknown): value is ContainerStatus {
  return typeof value === "string" && (CONTAINER_STATUSES as readonly string[]).includes(value);
}

export function isContainerCondition(value: unknown): value is ContainerCondition {
  return typeof value === "string" && (CONTAINER_CONDITIONS as readonly string[]).includes(value);
}

export function isContainerSizeFt(value: unknown): value is ContainerSizeFt {
  return typeof value === "number" && (CONTAINER_SIZES_FT as readonly number[]).includes(value);
}
