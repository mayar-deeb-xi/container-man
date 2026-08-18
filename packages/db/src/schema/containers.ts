import { relations, sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  ContainerCondition,
  ContainerSizeFt,
  ContainerStatus,
  ContainerType,
} from "@repo/shipping";
import { CONTAINER_CONDITIONS, CONTAINER_STATUSES, CONTAINER_TYPES } from "@repo/shipping";

import { users } from "./users";

/**
 * The enum values come from `@repo/shipping` so the column, the DTO validator and the
 * console's filter cannot disagree about which statuses exist. The cast is because
 * drizzle types `pgEnum` against a mutable non-empty tuple while the vocabulary is a
 * `readonly` one — the values are identical, only the modifier differs.
 */
export const containerType = pgEnum(
  "container_type",
  CONTAINER_TYPES as unknown as [ContainerType],
);
export const containerStatus = pgEnum(
  "container_status",
  CONTAINER_STATUSES as unknown as [ContainerStatus],
);
export const containerCondition = pgEnum(
  "container_condition",
  CONTAINER_CONDITIONS as unknown as [ContainerCondition],
);

/**
 * A shipping container — a physical steel box, not a process.
 *
 * The columns follow what is stamped on the box and what a yard needs to answer about it:
 * its ISO 6346 identity, the two weights from its CSC plate, where it is, and what state
 * it is in. Anything commercial (bookings, rates, voyage legs) is deliberately absent —
 * those belong to their own tables, and a booking reference here would make the row mean
 * two things at once.
 */
export const containers = pgTable(
  "containers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * ISO 6346 identity — eleven characters, always stored normalized (uppercase, no
     * separators) because `MSCU 123456-5` and `mscu1234565` are the same box. The check
     * digit is validated on the way in by `@repo/shipping`.
     */
    containerNumber: text("container_number").notNull(),
    /** ISO size/type code from the door, e.g. `22G1`. Free text: hundreds are valid. */
    isoTypeCode: text("iso_type_code"),
    type: containerType("type").notNull(),
    /** Nominal length in feet. A number, so a list can sort by size rather than by string. */
    sizeFt: smallint("size_ft").$type<ContainerSizeFt>().notNull(),
    status: containerStatus("status").notNull().default("available"),
    condition: containerCondition("condition").notNull().default("cargo_worthy"),
    /** Empty weight of the box itself, in kg — from the CSC plate. */
    tareWeightKg: integer("tare_weight_kg").notNull(),
    /**
     * Maximum laden weight, in kg, also from the plate. Payload is the difference between
     * this and the tare and is *derived* rather than stored — a third column would let the
     * three disagree with the plate, which is worse than not recording it at all.
     */
    maxGrossWeightKg: integer("max_gross_weight_kg").notNull(),
    cubicCapacityM3: numeric("cubic_capacity_m3", { precision: 6, scale: 2, mode: "number" }),
    /** Shipping line or lessee currently operating the box — not its registered owner. */
    operator: text("operator"),
    /** UN/LOCODE of where it is now, e.g. `EGALY`. Five characters, or null if unknown. */
    unlocode: text("unlocode"),
    /** Yard, depot or terminal name, for the humans who cannot read a LOCODE at a glance. */
    depot: text("depot"),
    /**
     * Dates, not timestamps: a build month and a survey deadline have no time of day, and
     * storing one invites a timezone to move them across a day boundary. `mode: "string"`
     * keeps them as `YYYY-MM-DD` end to end for the same reason.
     */
    manufacturedOn: date("manufactured_on", { mode: "string" }),
    /** Next CSC periodic examination. A box past this date may not legally be shipped. */
    nextInspectionOn: date("next_inspection_on", { mode: "string" }),
    /** Only meaningful for a reefer; the API refuses it on any other type. */
    reeferSetpointC: numeric("reefer_setpoint_c", { precision: 4, scale: 1, mode: "number" }),
    notes: text("notes"),
    /**
     * The console account responsible for this box.
     *
     * Named for the *console*, not the industry: a container's owner is the leasing company
     * encoded in its number's owner code, which is a different fact. This column is what
     * makes an ownership rule expressible — a role granted `update Container` with
     * conditions `{ "assignedToId": "${user.id}" }` can edit only the boxes it is given.
     *
     * `set null` rather than cascade: losing the person must not lose the container.
     */
    assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    /**
     * Soft delete, as everywhere else. Note this is *not* how a scrapped box is recorded —
     * that is `status: "retired"`, which keeps it in the fleet list where its history still
     * resolves. Deleting is for a row that should not have existed.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    /**
     * Partial, exactly like `users_email_idx`: a container number is unique among live
     * rows, so deleting a row frees the number for re-entry. `ON CONFLICT` statements must
     * repeat the predicate for Postgres to infer this index — see the seed.
     */
    uniqueIndex("containers_number_idx")
      .on(table.containerNumber)
      .where(sql`${table.deletedAt} is null`),
    // The console's default view filters by status and the fleet desk filters by type;
    // both are low-cardinality, but this is the table expected to grow.
    index("containers_status_idx").on(table.status),
    index("containers_type_idx").on(table.type),
    // "The containers assigned to me" — the query an ownership-conditioned rule implies.
    index("containers_assigned_to_id_idx").on(table.assignedToId),
  ],
);

export const containersRelations = relations(containers, ({ one }) => ({
  assignedTo: one(users, { fields: [containers.assignedToId], references: [users.id] }),
}));

export type Container = typeof containers.$inferSelect;
export type NewContainer = typeof containers.$inferInsert;
