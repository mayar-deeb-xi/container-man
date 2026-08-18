import { eq, inArray, sql } from "drizzle-orm";

import type {
  ContainerCondition,
  ContainerSizeFt,
  ContainerStatus,
  ContainerType,
} from "@repo/shipping";
import { toContainerNumber, TYPICAL_PLATE, typicalCapacityM3 } from "@repo/shipping";

import { db } from "../client";
import { containers, users } from "../schema";

/**
 * A demo fleet — enough boxes to make the console's filters mean something.
 *
 * Called from `seedDemo`, so it follows the same opt-in: these are not rows an install
 * needs, they are rows to click on. Kept in its own file because the container vocabulary
 * is what makes them interesting, and that reads better beside the data than buried in the
 * demo orchestration.
 */

interface DemoContainer {
  /** The first ten characters. The check digit is computed, never typed. */
  prefix: string;
  type: ContainerType;
  sizeFt: ContainerSizeFt;
  status: ContainerStatus;
  condition: ContainerCondition;
  isoTypeCode: string;
  operator: string;
  unlocode: string | null;
  depot: string | null;
  manufacturedOn: string;
  nextInspectionOn: string;
  reeferSetpointC?: number;
  notes?: string;
  /** Email of the demo account responsible, if any. */
  assignedTo?: string;
}

/**
 * Chosen to cover the combinations the console has to render rather than to look like a
 * real fleet: every status appears at least once, both reefer setpoints are negative
 * (nobody ships bananas at +30), one box is overdue for survey, one is unassigned, and one
 * is `retired` — which is how a scrapped box is recorded, as opposed to being deleted.
 */
const DEMO_CONTAINERS: readonly DemoContainer[] = [
  {
    prefix: "MSCU100000",
    type: "dry",
    sizeFt: 20,
    status: "available",
    condition: "cargo_worthy",
    isoTypeCode: "22G1",
    operator: "MSC",
    unlocode: "EGALY",
    depot: "Alexandria Container Terminal",
    manufacturedOn: "2019-04-01",
    nextInspectionOn: "2027-04-01",
    assignedTo: "olivia.operator@example.com",
  },
  {
    prefix: "MSCU200001",
    type: "high_cube",
    sizeFt: 40,
    status: "allocated",
    condition: "cargo_worthy",
    isoTypeCode: "45G1",
    operator: "MSC",
    unlocode: "EGPSD",
    depot: "Port Said East",
    manufacturedOn: "2021-08-01",
    nextInspectionOn: "2029-08-01",
    assignedTo: "olivia.operator@example.com",
  },
  {
    prefix: "MAEU300002",
    type: "reefer",
    sizeFt: 40,
    status: "loaded",
    condition: "new",
    isoTypeCode: "45R1",
    operator: "Maersk",
    unlocode: "NLRTM",
    depot: "Rotterdam World Gateway",
    manufacturedOn: "2024-02-01",
    nextInspectionOn: "2029-02-01",
    reeferSetpointC: -18,
    notes: "Frozen cargo. Pre-trip inspection passed on load.",
    assignedTo: "olivia.operator@example.com",
  },
  {
    prefix: "MAEU400003",
    type: "reefer",
    sizeFt: 20,
    status: "in_transit",
    condition: "cargo_worthy",
    isoTypeCode: "22R1",
    operator: "Maersk",
    unlocode: null,
    depot: null,
    manufacturedOn: "2020-11-01",
    nextInspectionOn: "2028-11-01",
    reeferSetpointC: 2.5,
    notes: "Chilled produce.",
  },
  {
    prefix: "CMAU500004",
    type: "open_top",
    sizeFt: 20,
    status: "at_port",
    condition: "wind_water_tight",
    isoTypeCode: "22U1",
    operator: "CMA CGM",
    unlocode: "EGALY",
    depot: "Alexandria Container Terminal",
    manufacturedOn: "2016-06-01",
    // Already past — this is the box the `inspectionDue` filter exists for.
    nextInspectionOn: "2026-01-15",
    notes: "Tarpaulin replaced. Due for CSC examination.",
    assignedTo: "victor.viewer@example.com",
  },
  {
    prefix: "HLXU600005",
    type: "flat_rack",
    sizeFt: 40,
    status: "under_repair",
    condition: "damaged",
    isoTypeCode: "42P1",
    operator: "Hapag-Lloyd",
    unlocode: "DEHAM",
    depot: "Hamburg Süd Depot",
    manufacturedOn: "2015-03-01",
    nextInspectionOn: "2026-09-01",
    notes: "Bent end frame after a stow incident. Awaiting parts.",
  },
  {
    prefix: "ONEU700006",
    type: "tank",
    sizeFt: 20,
    status: "damaged",
    condition: "damaged",
    isoTypeCode: "22T1",
    operator: "ONE",
    unlocode: "SGSIN",
    depot: "Jurong Tank Depot",
    manufacturedOn: "2018-09-01",
    nextInspectionOn: "2026-03-01",
    notes: "Failed pressure test. Out of service pending survey.",
  },
  {
    prefix: "EVGU800007",
    type: "ventilated",
    sizeFt: 20,
    status: "available",
    condition: "cargo_worthy",
    isoTypeCode: "22V1",
    operator: "Evergreen",
    unlocode: "EGALY",
    depot: "Alexandria Container Terminal",
    manufacturedOn: "2017-05-01",
    nextInspectionOn: "2027-05-01",
    notes: "Coffee and cocoa service.",
  },
  {
    prefix: "MSCU900008",
    type: "dry",
    sizeFt: 45,
    status: "retired",
    condition: "damaged",
    isoTypeCode: "L5G1",
    operator: "MSC",
    unlocode: "EGALY",
    depot: "Alexandria Scrap Yard",
    manufacturedOn: "2004-01-01",
    nextInspectionOn: "2025-01-01",
    notes: "Scrapped after corrosion survey. Kept for history, not deleted.",
  },
];

export async function seedDemoContainers(): Promise<void> {
  const assigneeEmails = [
    ...new Set(
      DEMO_CONTAINERS.map((definition) => definition.assignedTo).filter(
        (email): email is string => email !== undefined,
      ),
    ),
  ];

  const userIdByEmail = new Map(
    (
      await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.email, assigneeEmails))
    ).map((row) => [row.email, row.id]),
  );

  for (const definition of DEMO_CONTAINERS) {
    // The check digit is computed from the prefix rather than written into the data above:
    // a hand-typed one would eventually be wrong, and the API validates it — so a bad digit
    // here would surface as a seed that cannot round-trip through its own endpoints.
    const containerNumber = toContainerNumber(definition.prefix);
    if (!containerNumber) {
      throw new Error(
        `Demo container prefix "${definition.prefix}" is not a valid ISO 6346 prefix.`,
      );
    }

    const plate = TYPICAL_PLATE[definition.sizeFt];

    await db
      .insert(containers)
      .values({
        containerNumber,
        isoTypeCode: definition.isoTypeCode,
        type: definition.type,
        sizeFt: definition.sizeFt,
        status: definition.status,
        condition: definition.condition,
        tareWeightKg: plate.tareWeightKg,
        maxGrossWeightKg: plate.maxGrossWeightKg,
        cubicCapacityM3: typicalCapacityM3(definition.sizeFt, definition.type),
        operator: definition.operator,
        unlocode: definition.unlocode,
        depot: definition.depot,
        manufacturedOn: definition.manufacturedOn,
        nextInspectionOn: definition.nextInspectionOn,
        reeferSetpointC: definition.reeferSetpointC ?? null,
        notes: definition.notes ?? null,
        assignedToId: definition.assignedTo
          ? (userIdByEmail.get(definition.assignedTo) ?? null)
          : null,
      })
      .onConflictDoUpdate({
        target: containers.containerNumber,
        // The number index is partial, and Postgres only infers a partial index when the
        // statement repeats its predicate — the same note as in the user seeds.
        targetWhere: sql`${containers.deletedAt} is null`,
        // Only the operational fields are re-asserted, and the row is undeleted: a developer
        // who moved a box through the console keeps their edits to notes and location, while
        // re-running the seed still restores the fleet they started from.
        set: {
          status: definition.status,
          condition: definition.condition,
          deletedAt: null,
        },
      });
  }

  console.log(`Seeded ${DEMO_CONTAINERS.length} demo containers.`);
}

/** Removes the demo fleet. Hard, not soft: these rows never existed outside a demo. */
export async function removeDemoContainers(): Promise<void> {
  const numbers = DEMO_CONTAINERS.map((definition) => toContainerNumber(definition.prefix)).filter(
    (number): number is string => number !== null,
  );

  for (const number of numbers) {
    await db.delete(containers).where(eq(containers.containerNumber, number));
  }

  console.log(`Removed ${numbers.length} demo containers.`);
}
