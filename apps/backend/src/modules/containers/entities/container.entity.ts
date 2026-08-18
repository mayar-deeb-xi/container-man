import { Exclude, Expose, Type } from "class-transformer";

import type {
  ContainerCondition,
  ContainerSizeFt,
  ContainerStatus,
  ContainerType,
} from "@repo/shipping";

/** The console account a box is assigned to, reduced to what a row or a chip needs. */
@Exclude()
export class ContainerAssigneeEntity {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string | null;
}

/**
 * Serialization allowlist for a shipping container.
 *
 * Only `@Expose`d fields reach the wire, and the service hands the interceptor a database
 * row — so this list is what decides the wire format, as it does for every other module
 * here. Adding a column is safe by default; exposing it is the deliberate act.
 *
 * `deletedAt` is absent: these endpoints only ever return live rows, so a field that is
 * always null would just invite a client to branch on it.
 */
@Exclude()
export class ContainerEntity {
  @Expose() id: string;
  /** ISO 6346, normalized — eleven characters with a check digit that agrees. */
  @Expose() containerNumber: string;
  @Expose() isoTypeCode: string | null;
  @Expose() type: ContainerType;
  @Expose() sizeFt: ContainerSizeFt;
  @Expose() status: ContainerStatus;
  @Expose() condition: ContainerCondition;
  @Expose() tareWeightKg: number;
  @Expose() maxGrossWeightKg: number;

  /**
   * Max cargo weight — gross minus tare.
   *
   * Sent, not stored, and not left to the client either. The two weights come off the CSC
   * plate and the payload is arithmetic on them: a third column could disagree with the
   * plate, while every client computing it independently is every client rounding it
   * differently. The service fills it from `payloadKg()` in `@repo/shipping`, which is the
   * one definition of that subtraction.
   */
  @Expose() payloadKg: number;

  @Expose() cubicCapacityM3: number | null;
  @Expose() operator: string | null;
  @Expose() unlocode: string | null;
  @Expose() depot: string | null;
  /** `YYYY-MM-DD`; the column is a date, so there is no time of day to misread. */
  @Expose() manufacturedOn: string | null;
  @Expose() nextInspectionOn: string | null;
  /** Null on anything that is not a reefer — the API refuses to set it otherwise. */
  @Expose() reeferSetpointC: number | null;
  @Expose() notes: string | null;
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;

  /**
   * The console account responsible for this box, resolved rather than left as an id: a
   * table showing "assigned to" wants a name, and the alternative is every client fetching
   * the user list to render one column.
   */
  @Expose()
  @Type(() => ContainerAssigneeEntity)
  assignedTo: ContainerAssigneeEntity | null;

  /**
   * The raw foreign key, exposed *as well as* the resolved assignee above.
   *
   * Not redundancy for its own sake: a permission rule's conditions are written against
   * column names — `{ "assignedToId": "${user.id}" }` — and CASL evaluates them against
   * whatever object it is handed. The backend hands it a database row, which has this
   * column; the console hands it this payload. If the payload omitted the column, the same
   * rule would be *enforced* by the API and silently *unevaluable* in the browser, so every
   * guarded control would hide itself on a box the API would happily let you edit.
   *
   * The rule of thumb this encodes: any column a condition may reference has to be exposed.
   */
  @Expose() assignedToId: string | null;
}
