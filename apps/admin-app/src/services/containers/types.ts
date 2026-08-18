import type {
  ContainerCondition,
  ContainerSizeFt,
  ContainerStatus,
  ContainerType,
} from "@repo/shipping";

import type { Pagination } from "~/lib/base-response";
import type { SessionRole } from "~/services/auth/types";

/**
 * Client-side mirror of what `/containers` returns — the backend's `ContainerEntity`, in
 * `apps/backend/src/modules/containers/entities/container.entity.ts`, which is the source
 * of truth for which columns are exposed.
 *
 * The vocabulary types come from `@repo/shipping` rather than being restated: which
 * statuses exist is not this app's opinion, and a hand-mirrored union would eventually
 * offer a filter the API rejects. What the *wire* carries is still described here.
 *
 * Timestamps are strings because JSON has no date type. `manufacturedOn` and
 * `nextInspectionOn` are strings for a stronger reason: they are `date` columns, so
 * `YYYY-MM-DD` is the whole value and parsing them into a `Date` would attach a timezone
 * that can move them across a day boundary.
 */
export interface Container {
  id: string;
  containerNumber: string;
  isoTypeCode: string | null;
  type: ContainerType;
  sizeFt: ContainerSizeFt;
  status: ContainerStatus;
  condition: ContainerCondition;
  tareWeightKg: number;
  maxGrossWeightKg: number;
  /** Derived by the API from the two weights above — never sent back on a write. */
  payloadKg: number;
  cubicCapacityM3: number | null;
  operator: string | null;
  unlocode: string | null;
  depot: string | null;
  manufacturedOn: string | null;
  nextInspectionOn: string | null;
  reeferSetpointC: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** The console account responsible, resolved by the API so a row can show a name. */
  assignedTo: (Pick<SessionRole, "id"> & { email: string; name: string | null }) | null;
}

/** The `assignedToId` filter value meaning "nobody" — a uuid cannot express absence. */
export const UNASSIGNED = "unassigned";

/** The filters that make one page of containers a distinct query — and cache entry. */
export interface ContainersQueryFilters {
  skip: number;
  take: number;
  search?: string;
  status?: ContainerStatus;
  type?: ContainerType;
  condition?: ContainerCondition;
  sizeFt?: ContainerSizeFt;
  /** A user id, or `UNASSIGNED`. */
  assignedToId?: string;
  /** Boxes whose CSC examination has passed or is within 30 days. */
  inspectionDue?: boolean;
}

export interface ContainersPage {
  containers: Container[];
  pagination: Pagination;
}

export interface CreateContainerPayload {
  containerNumber: string;
  type: ContainerType;
  sizeFt: ContainerSizeFt;
  tareWeightKg: number;
  maxGrossWeightKg: number;
  status?: ContainerStatus;
  condition?: ContainerCondition;
  isoTypeCode?: string;
  cubicCapacityM3?: number;
  operator?: string;
  unlocode?: string;
  depot?: string;
  manufacturedOn?: string;
  nextInspectionOn?: string;
  reeferSetpointC?: number;
  notes?: string;
  assignedToId?: string;
}

/**
 * Every field optional — an absent key leaves that column alone, and an explicit `null`
 * clears it. Only the fields with a meaningful empty state are nullable: a container
 * without a tare weight is a record nobody can act on.
 */
export interface UpdateContainerPayload {
  containerNumber?: string;
  type?: ContainerType;
  sizeFt?: ContainerSizeFt;
  tareWeightKg?: number;
  maxGrossWeightKg?: number;
  status?: ContainerStatus;
  condition?: ContainerCondition;
  isoTypeCode?: string | null;
  cubicCapacityM3?: number | null;
  operator?: string | null;
  unlocode?: string | null;
  depot?: string | null;
  manufacturedOn?: string | null;
  nextInspectionOn?: string | null;
  reeferSetpointC?: number | null;
  notes?: string | null;
  assignedToId?: string | null;
}
