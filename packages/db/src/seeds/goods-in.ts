import { eq, inArray, sql } from "drizzle-orm";

import type { GoodsDocType, PackingType, WasteClassification, WeeeCategory } from "@repo/goods-in";
import { STANDARD_TARE_KG } from "@repo/goods-in";

import { db } from "../client";
import { deliveries, fileBlobs, files, pallets, suppliers, users } from "../schema";

/**
 * A demo goods-in register — enough deliveries to make every state of the console real.
 *
 * Called from `seedDemo`, so it follows the same opt-in. Like the demo fleet, the rows
 * are chosen to cover what the pages have to render rather than to look like a busy
 * yard: a signed record (the immutable case), a draft mid-entry with the one thing that
 * blocks signing, an empty draft, a special-packing pallet, and a draft in the trash.
 *
 * Deliveries, pallets and files carry *fixed ids* (valid v4-shaped uuids) because the
 * register number is `GENERATED ALWAYS` and nothing else about a delivery is naturally
 * unique — the id is what makes re-running the seed find its own rows. A consequence
 * worth knowing: the `GI-` numbers differ per install, since the sequence assigns them.
 */

interface DemoSupplier {
  code: string;
  name: string;
  notes?: string;
}

/** S014 is the number the paper form this feature replaced used in its own example. */
const DEMO_SUPPLIERS: readonly DemoSupplier[] = [
  { code: "S001", name: "Elektro Sammel Nord GmbH" },
  {
    code: "S014",
    name: "RecyTech Handels AG",
    notes: "Weekly collection round. Usually announces deliveries a day ahead.",
  },
  { code: "S022", name: "GreenLoop Logistik" },
  { code: "S030", name: "Stadtwerke Altgeräte-Rücknahme" },
];

interface DemoPallet {
  id: string;
  palletNo: number;
  packing: PackingType;
  material: string;
  weeeCategory?: WeeeCategory;
  grossWeightKg: number;
  /** Only for `special` packing; every other tare comes from the standard table below. */
  tareKg?: number;
  quantityPcs?: number;
  classification?: WasteClassification;
  notice?: string;
  /** Email of the demo account that checked it. */
  worker: string;
}

interface DemoFile {
  id: string;
  /** Photo of this pallet id, or… */
  palletId?: string;
  /** …scan of this document type. Exactly one of the two, like the API enforces. */
  docType?: GoodsDocType;
  fileName: string;
  /** Key into `DEMO_IMAGES`. */
  image: keyof typeof DEMO_IMAGES;
  uploadedBy: string;
}

interface DemoDelivery {
  id: string;
  supplierCode: string;
  deliveredOn: string;
  lotNo?: string;
  documents: GoodsDocType[];
  /** Set on the signed records; drafts leave it out. */
  signed?: { by: string; at: string };
  /** Set on the one draft that demonstrates the trash. */
  deletedAt?: string;
  pallets: readonly DemoPallet[];
  files: readonly DemoFile[];
}

const OPERATOR = "olivia.operator@example.com";
const SCALE = "sami.scale@example.com";
const ADMIN = "alex.admin@example.com";

const DEMO_DELIVERIES: readonly DemoDelivery[] = [
  {
    // The finished article: signed, classified throughout, photographed, scans filed.
    // This is the record the register exists to keep — and the one nothing can edit.
    id: "de1d0000-0000-4000-8000-000000000001",
    supplierCode: "S014",
    deliveredOn: "2026-08-20",
    lotNo: "LOT-2608-A",
    documents: ["cmr", "delivery_note", "weight_certificate"],
    signed: { by: ADMIN, at: "2026-08-20T14:35:00Z" },
    pallets: [
      {
        id: "9a11e700-0000-4000-8000-000000000011",
        palletNo: 1,
        packing: "eur_kar",
        material: "Small appliances, mixed household",
        weeeCategory: 5,
        grossWeightKg: 235,
        quantityPcs: 48,
        classification: "waste",
        worker: SCALE,
      },
      {
        id: "9a11e700-0000-4000-8000-000000000012",
        palletNo: 2,
        packing: "eur",
        material: "Flat screens, office clear-out",
        weeeCategory: 2,
        grossWeightKg: 198,
        quantityPcs: 22,
        classification: "reuse",
        worker: SCALE,
      },
      {
        id: "9a11e700-0000-4000-8000-000000000013",
        palletNo: 3,
        packing: "one_way",
        material: "IT equipment, defective",
        weeeCategory: 6,
        grossWeightKg: 172,
        classification: "waste",
        notice: "Damaged packaging — repalletized at the gate.",
        worker: OPERATOR,
      },
    ],
    files: [
      {
        id: "f11e0000-0000-4000-8000-000000000021",
        palletId: "9a11e700-0000-4000-8000-000000000011",
        fileName: "IMG_2041.png",
        image: "slate",
        uploadedBy: SCALE,
      },
      {
        id: "f11e0000-0000-4000-8000-000000000022",
        palletId: "9a11e700-0000-4000-8000-000000000012",
        fileName: "IMG_2044.png",
        image: "steel",
        uploadedBy: SCALE,
      },
      {
        id: "f11e0000-0000-4000-8000-000000000023",
        docType: "weight_certificate",
        fileName: "scan_weighbridge.png",
        image: "paper",
        uploadedBy: ADMIN,
      },
    ],
  },
  {
    // Mid-entry: one pallet still unclassified, which is exactly what blocks the
    // sign-off dialog — open it on this record to see the refusal spelled out.
    id: "de1d0000-0000-4000-8000-000000000002",
    supplierCode: "S001",
    deliveredOn: "2026-08-25",
    lotNo: "CHARGE-B12",
    documents: ["delivery_note"],
    pallets: [
      {
        id: "9a11e700-0000-4000-8000-000000000031",
        palletNo: 1,
        packing: "gitterbox",
        material: "Power tools and cables",
        weeeCategory: 5,
        grossWeightKg: 412,
        classification: "waste",
        worker: SCALE,
      },
      {
        id: "9a11e700-0000-4000-8000-000000000032",
        palletNo: 2,
        packing: "eur",
        material: "Laptops, untested batch",
        weeeCategory: 6,
        grossWeightKg: 145,
        quantityPcs: 60,
        notice: "Possible reuse — awaiting the tester's verdict.",
        worker: OPERATOR,
      },
    ],
    files: [
      {
        id: "f11e0000-0000-4000-8000-000000000041",
        palletId: "9a11e700-0000-4000-8000-000000000031",
        fileName: "IMG_2087.png",
        image: "moss",
        uploadedBy: SCALE,
      },
    ],
  },
  {
    // Just announced, nothing weighed yet — the empty state, and the other sign blocker.
    id: "de1d0000-0000-4000-8000-000000000003",
    supplierCode: "S022",
    deliveredOn: "2026-08-26",
    documents: [],
    pallets: [],
    files: [],
  },
  {
    // A `special` packing pallet: the one whose tare was weighed rather than looked up.
    id: "de1d0000-0000-4000-8000-000000000004",
    supplierCode: "S001",
    deliveredOn: "2026-08-11",
    documents: ["cmr", "annex_vii"],
    signed: { by: ADMIN, at: "2026-08-11T16:02:00Z" },
    pallets: [
      {
        id: "9a11e700-0000-4000-8000-000000000051",
        palletNo: 1,
        packing: "special",
        material: "Server rack, complete",
        weeeCategory: 4,
        grossWeightKg: 388,
        tareKg: 12,
        quantityPcs: 1,
        classification: "reuse",
        notice: "Delivered strapped to its own transport frame.",
        worker: OPERATOR,
      },
    ],
    files: [],
  },
  {
    // A mistaken draft in the trash — what the restore button exists for.
    id: "de1d0000-0000-4000-8000-000000000005",
    supplierCode: "S030",
    deliveredOn: "2026-08-05",
    lotNo: "LOT-DUPLICATE",
    documents: [],
    deletedAt: "2026-08-05T09:12:00Z",
    pallets: [
      {
        id: "9a11e700-0000-4000-8000-000000000061",
        palletNo: 1,
        packing: "owp_kart",
        material: "Entered twice by mistake — see GI register",
        grossWeightKg: 96,
        worker: OPERATOR,
      },
    ],
    files: [],
  },
];

/**
 * Tiny but real PNGs (solid 64×64 colours, ~180 bytes each), so the photo galleries and
 * scan chips render and download without shipping binaries in the repo. Generated with
 * a scripted PNG writer; the console's own uploads replace them the moment anyone tries
 * the camera flow.
 */
const DEMO_IMAGES = {
  slate:
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwBfWCLawtCH8OITBAtxm7fN1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWPHYBHw0xS4VAcmEAAAAASUVORK5CYII=",
  moss: "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeElEQVR4nO3PUQkAIBTAwBdW81jZEH4cwmABbrPP+rrhgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAseu6ZSgTyBwqeuAAAAAElFTkSuQmCC",
  steel:
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PUQkAIBTAwNcfTGEK2xnCj0MYLMBt1j5fN1zQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1owWMXpmaRw7DvyvMAAAAASUVORK5CYII=",
  paper:
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeklEQVR4nO3PwQkAIBDAsNt/Sp+CSziEjyAUOkA6Z6+vGy5oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga0oAEtaEALGtCCBrSgAS1oQAsa0IIGtKABLWhACxrQgga04LEL8E0yhslojNcAAAAASUVORK5CYII=",
} as const;

export async function seedDemoGoodsIn(): Promise<void> {
  // Suppliers first — everything else points at them. Upsert on the code (a partial
  // unique index, so the predicate is repeated), undeleting like the other seeds do.
  for (const definition of DEMO_SUPPLIERS) {
    await db
      .insert(suppliers)
      .values({
        code: definition.code,
        name: definition.name,
        notes: definition.notes ?? null,
      })
      .onConflictDoUpdate({
        target: suppliers.code,
        // The code index is partial, and Postgres only infers a partial index when the
        // statement repeats its predicate — the same note as in the other seeds.
        targetWhere: sql`${suppliers.deletedAt} is null`,
        // Undeletes, and re-asserts the name; notes stay as a developer left them.
        set: { name: definition.name, deletedAt: null },
      });
  }

  const supplierIdByCode = new Map(
    (
      await db
        .select({ id: suppliers.id, code: suppliers.code })
        .from(suppliers)
        .where(
          inArray(
            suppliers.code,
            DEMO_SUPPLIERS.map((definition) => definition.code),
          ),
        )
    ).map((row) => [row.code, row.id]),
  );

  const emails = [OPERATOR, SCALE, ADMIN];
  const userIdByEmail = new Map(
    (
      await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.email, emails))
    ).map((row) => [row.email, row.id]),
  );

  const requireUser = (email: string): string => {
    const id = userIdByEmail.get(email);
    if (!id) {
      throw new Error(`Demo delivery references "${email}" — run the demo user seed first.`);
    }
    return id;
  };

  let deliveryCount = 0;
  let palletCount = 0;
  let fileCount = 0;

  for (const definition of DEMO_DELIVERIES) {
    const supplierId = supplierIdByCode.get(definition.supplierCode);
    if (!supplierId) throw new Error(`Demo supplier "${definition.supplierCode}" did not seed.`);

    // DoNothing rather than update: a delivery is state a developer plays with — pallets
    // reclassified, drafts signed, the trashed one restored — and a seed that snapped it
    // all back on re-run would look like the console losing their work.
    const [created] = await db
      .insert(deliveries)
      .values({
        id: definition.id,
        supplierId,
        deliveredOn: definition.deliveredOn,
        lotNo: definition.lotNo ?? null,
        documents: definition.documents,
        status: definition.signed ? "signed" : "draft",
        signedById: definition.signed ? requireUser(definition.signed.by) : null,
        signedAt: definition.signed ? new Date(definition.signed.at) : null,
        deletedAt: definition.deletedAt ? new Date(definition.deletedAt) : null,
      })
      .onConflictDoNothing()
      .returning({ id: deliveries.id });

    if (created) deliveryCount += 1;

    for (const pallet of definition.pallets) {
      // The same tare rule the API enforces: standard packings take the table's value,
      // only `special` carries the weighed one from the data above.
      const tareKg =
        pallet.packing === "special" ? pallet.tareKg : STANDARD_TARE_KG[pallet.packing];
      if (tareKg === undefined || tareKg === null) {
        throw new Error(`Demo pallet ${pallet.id} has no tare — special packing needs tareKg.`);
      }

      const [insertedPallet] = await db
        .insert(pallets)
        .values({
          id: pallet.id,
          deliveryId: definition.id,
          palletNo: pallet.palletNo,
          packing: pallet.packing,
          material: pallet.material,
          weeeCategory: pallet.weeeCategory ?? null,
          grossWeightKg: pallet.grossWeightKg,
          tareKg,
          quantityPcs: pallet.quantityPcs ?? null,
          classification: pallet.classification ?? null,
          notice: pallet.notice ?? null,
          workerId: requireUser(pallet.worker),
        })
        .onConflictDoNothing()
        .returning({ id: pallets.id });

      if (insertedPallet) palletCount += 1;
    }

    for (const file of definition.files) {
      const content = Buffer.from(DEMO_IMAGES[file.image], "base64");
      // The same key convention the API writes, so nothing downstream can tell a seeded
      // file from an uploaded one.
      const storageKey = `deliveries/${definition.id}/${file.id}`;

      await db
        .insert(fileBlobs)
        .values({ key: storageKey, contentType: "image/png", content })
        .onConflictDoNothing();

      const [insertedFile] = await db
        .insert(files)
        .values({
          id: file.id,
          storageKey,
          fileName: file.fileName,
          mimeType: "image/png",
          sizeBytes: content.length,
          deliveryId: definition.id,
          palletId: file.palletId ?? null,
          docType: file.docType ?? null,
          uploadedById: requireUser(file.uploadedBy),
        })
        .onConflictDoNothing()
        .returning({ id: files.id });

      if (insertedFile) fileCount += 1;
    }
  }

  console.log(
    `Seeded demo goods-in: ${DEMO_SUPPLIERS.length} suppliers, ` +
      `${deliveryCount} deliveries, ${palletCount} pallets, ${fileCount} files ` +
      `(existing rows left as they are).`,
  );
}

/**
 * Removes the demo register. Hard deletes, like the demo fleet: these rows never
 * existed outside a demo, and the pallets and file rows fall with their deliveries.
 * Suppliers are only removed while nothing else points at them — a developer may have
 * recorded real practice deliveries against a demo code, and those must keep resolving.
 */
export async function removeDemoGoodsIn(): Promise<void> {
  const deliveryIds = DEMO_DELIVERIES.map((definition) => definition.id);
  const blobKeys = DEMO_DELIVERIES.flatMap((definition) =>
    definition.files.map((file) => `deliveries/${definition.id}/${file.id}`),
  );

  if (blobKeys.length > 0) {
    await db.delete(fileBlobs).where(inArray(fileBlobs.key, blobKeys));
  }

  const removed = await db
    .delete(deliveries)
    .where(inArray(deliveries.id, deliveryIds))
    .returning({ id: deliveries.id });

  let supplierCount = 0;
  for (const definition of DEMO_SUPPLIERS) {
    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.code, definition.code))
      .limit(1);
    if (!supplier) continue;

    const [referencing] = await db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(eq(deliveries.supplierId, supplier.id))
      .limit(1);

    if (referencing) {
      console.log(`Kept supplier ${definition.code}: non-demo deliveries reference it.`);
      continue;
    }

    await db.delete(suppliers).where(eq(suppliers.id, supplier.id));
    supplierCount += 1;
  }

  console.log(`Removed ${removed.length} demo deliveries and ${supplierCount} demo suppliers.`);
}
