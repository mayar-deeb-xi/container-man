import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import type { AppAbility } from "@repo/access";
import type { Delivery, Pallet } from "@repo/db";
import type { PackingType } from "@repo/goods-in";
import { asSubject } from "@repo/access";
import { deliveries, files, pallets, suppliers, users } from "@repo/db";
import {
  formatDeliveryReference,
  formatPalletLabel,
  isSpecialPacking,
  netWeightKg,
  parseDeliveryReference,
  SPECIAL_PACKING,
  standardTareKg,
} from "@repo/goods-in";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { CreateDeliveryDto } from "./dto/create-delivery.dto";
import type { CreatePalletDto } from "./dto/create-pallet.dto";
import type { ListDeliveriesDto, ListTrashedDeliveriesDto } from "./dto/list-deliveries.dto";
import type { UpdateDeliveryDto } from "./dto/update-delivery.dto";
import type { UpdatePalletDto } from "./dto/update-pallet.dto";
import type {
  DeliveryDetailEntity,
  DeliveryEntity,
  TrashedDeliveryEntity,
} from "./entities/delivery.entity";
import type { PalletEntity } from "./entities/pallet.entity";
import type { FileRow } from "./file-rows";
import type { ObjectStorage } from "../../lib/storage/storage.service";
import { abilityWhere } from "../../lib/ability/ability-where";
import { assertFieldsAllowed, touchedFields } from "../../lib/ability/field-access";
import { DRIZZLE } from "../../lib/db/db.module";
import { OBJECT_STORAGE } from "../../lib/storage/storage.service";
import { escapeLike, isUniqueViolation } from "../../lib/sql.utils";
import { fileSelection, toFileEntity } from "./file-rows";

/** A delivery joined with its supplier, signer and pallet aggregates. */
interface DeliveryRow extends Delivery {
  supplierCode: string;
  signerId: string | null;
  signerEmail: string | null;
  signerName: string | null;
  palletCount: number;
  totalNetWeightKg: number;
}

/** A pallet joined with the account that checked it. */
interface PalletRow extends Pallet {
  workerEmail: string;
  workerName: string | null;
}

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * The goods-in register, newest first: unlike the container fleet, this list is
   * chronological work — whoever opens it is looking for what just came in. The
   * delivery number is unique, so it is also the stable paging key.
   */
  async list(
    query: ListDeliveriesDto,
    ability: AppAbility,
  ): Promise<BaseResponse<DeliveryEntity[]>> {
    const { skip, take, search, status, supplierId, deliveredFrom, deliveredTo } = query;

    const where = and(
      isNull(deliveries.deletedAt),
      abilityWhere(ability, "read", "Delivery", getTableColumns(deliveries)),
      status ? eq(deliveries.status, status) : undefined,
      supplierId ? eq(deliveries.supplierId, supplierId) : undefined,
      deliveredFrom ? gte(deliveries.deliveredOn, deliveredFrom) : undefined,
      deliveredTo ? lte(deliveries.deliveredOn, deliveredTo) : undefined,
      this.searchWhere(search),
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select(this.selection())
        .from(deliveries)
        .innerJoin(suppliers, eq(suppliers.id, deliveries.supplierId))
        .leftJoin(users, eq(users.id, deliveries.signedById))
        .where(where)
        .orderBy(desc(deliveries.deliveryNo))
        .limit(take)
        .offset(skip),
      // The join rides along because `search` may reference the supplier's code; being
      // an inner join on a NOT NULL fk, it never changes the count.
      this.db
        .select({ total: count() })
        .from(deliveries)
        .innerJoin(suppliers, eq(suppliers.id, deliveries.supplierId))
        .where(where),
    ]);

    // The same canary as every other list: the push-down compiled the caller's rules
    // exactly, so this filter must keep every row and logs loudly if it ever cuts one.
    const visible = rows.filter((row) => ability.can("read", asSubject("Delivery", row)));
    if (visible.length !== rows.length) {
      this.logger.error(
        `ability push-down disagreed with the in-memory evaluator: ${rows.length - visible.length} of ${rows.length} delivery rows were cut after fetch`,
      );
    }

    return {
      data: visible.map((row) => this.toEntity(row)),
      pagination: { skip, take, total: totals?.total ?? 0 },
    };
  }

  /**
   * The supplier picker's options: id and code, nothing else.
   *
   * This exists so working with deliveries does not require `read Supplier` — that
   * grant reveals supplier *names*, and the whole point of the code system is that
   * goods-in staff work without them. Codes alone reveal nothing the register's own
   * rows do not already show.
   */
  async supplierOptions(): Promise<BaseResponse<{ id: string; code: string }[]>> {
    const rows = await this.db
      .select({ id: suppliers.id, code: suppliers.code })
      .from(suppliers)
      .where(isNull(suppliers.deletedAt))
      .orderBy(asc(suppliers.code));

    return { data: rows };
  }

  /** The full record: header plus every pallet, in floor order. */
  async findOne(id: string, ability: AppAbility): Promise<BaseResponse<DeliveryDetailEntity>> {
    const row = await this.requireRow(id);

    // 404 rather than 403 when a condition excludes it — do not confirm the record
    // exists to a caller whose rules were written to keep it out of view.
    if (!ability.can("read", asSubject("Delivery", row))) {
      throw new NotFoundException("Delivery not found");
    }

    return { data: await this.toDetailEntity(row) };
  }

  async create(dto: CreateDeliveryDto): Promise<BaseResponse<DeliveryEntity>> {
    await this.assertSupplier(dto.supplierId);

    const [created] = await this.db
      .insert(deliveries)
      .values({
        supplierId: dto.supplierId,
        deliveredOn: dto.deliveredOn,
        lotNo: dto.lotNo ?? null,
        documents: dto.documents ?? [],
      })
      .returning({ id: deliveries.id });

    if (!created) throw new ConflictException("The delivery could not be created");

    // Re-read through the joins so the response carries the supplier and the aggregates
    // the same way every other read does.
    return { data: this.toEntity(await this.requireRow(created.id)) };
  }

  /** Header changes — drafts only. A signed record refuses every write, this included. */
  async update(
    id: string,
    dto: UpdateDeliveryDto,
    ability: AppAbility,
  ): Promise<BaseResponse<DeliveryEntity>> {
    const existing = await this.requireRow(id);
    this.assertDraft(existing);
    this.assertAllowed(ability, "update", existing);
    assertFieldsAllowed(ability, asSubject("Delivery", existing), touchedFields(dto));

    if (dto.supplierId && dto.supplierId !== existing.supplierId) {
      await this.assertSupplier(dto.supplierId);
    }

    // `documents: null` clears the checklist; the column itself never holds NULL.
    const { documents, ...rest } = dto;
    const patch: Partial<typeof deliveries.$inferInsert> = {
      ...rest,
      ...(documents !== undefined ? { documents: documents ?? [] } : {}),
    };

    if (Object.values(patch).every((value) => value === undefined)) {
      return { data: this.toEntity(existing) };
    }

    const [updated] = await this.db
      .update(deliveries)
      .set(patch)
      // The status guard makes the write itself refuse a record signed between the read
      // above and now — the check-then-write gap closed where it matters.
      .where(
        and(eq(deliveries.id, id), isNull(deliveries.deletedAt), eq(deliveries.status, "draft")),
      )
      .returning({ id: deliveries.id });

    if (!updated) {
      throw new ConflictException("The delivery was signed or deleted in the meantime");
    }

    return { data: this.toEntity(await this.requireRow(updated.id)) };
  }

  /**
   * The sign-off — the paper form's bottom-line signature, as a state change.
   *
   * This is where the completeness the paper could only ask for is enforced: no empty
   * record, and no pallet still missing its waste/reuse classification, because the
   * classification is the one output everything downstream consumes. From here on the
   * record is immutable; there is no unsign.
   */
  async sign(
    id: string,
    ability: AppAbility,
    signerId: string,
  ): Promise<BaseResponse<DeliveryDetailEntity>> {
    const existing = await this.requireRow(id);

    if (existing.status === "signed") {
      throw new ConflictException("This delivery is already signed");
    }
    this.assertAllowed(ability, "update", existing);
    // The sign-off is its own field of the delivery, like `pallets`: a rule narrowed to
    // the rows and photos may fill the record in but not close it.
    assertFieldsAllowed(ability, asSubject("Delivery", existing), ["sign"]);

    const rows = await this.palletRows(id);

    if (rows.length === 0) {
      throw new BadRequestException("A delivery cannot be signed with no pallets recorded");
    }

    const unclassified = rows.filter((row) => row.classification === null);
    if (unclassified.length > 0) {
      const labels = unclassified.map((row) => formatPalletLabel(row.palletNo)).join(", ");
      throw new BadRequestException(
        `Every pallet needs a waste/reuse classification before signing — still open: ${labels}`,
      );
    }

    const [signed] = await this.db
      .update(deliveries)
      .set({ status: "signed", signedById: signerId, signedAt: new Date() })
      // `status = draft` settles a race between two signers: exactly one write wins,
      // the other lands here with no row and reports the conflict.
      .where(
        and(eq(deliveries.id, id), isNull(deliveries.deletedAt), eq(deliveries.status, "draft")),
      )
      .returning({ id: deliveries.id });

    if (!signed) throw new ConflictException("This delivery is already signed");

    return { data: await this.toDetailEntity(await this.requireRow(signed.id)) };
  }

  /**
   * Soft delete — drafts only. A signed record cannot be deleted at all: those are the
   * rows GoBD keeps for ten years, and no grant in this system removes one.
   */
  async softDelete(id: string, ability: AppAbility): Promise<void> {
    const existing = await this.requireRow(id);
    this.assertDraft(existing);
    this.assertAllowed(ability, "delete", existing);

    const [deleted] = await this.db
      .update(deliveries)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(deliveries.id, id), isNull(deliveries.deletedAt), eq(deliveries.status, "draft")),
      )
      .returning({ id: deliveries.id });

    if (!deleted) throw new NotFoundException("Delivery not found");
  }

  /** The trash — mistakenly entered drafts, newest deletion first. */
  async listTrash(
    query: ListTrashedDeliveriesDto,
    ability: AppAbility,
  ): Promise<BaseResponse<TrashedDeliveryEntity[]>> {
    const { skip, take, search } = query;

    const where = and(
      isNotNull(deliveries.deletedAt),
      abilityWhere(ability, "delete", "Delivery", getTableColumns(deliveries)),
      this.searchWhere(search),
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select(this.selection())
        .from(deliveries)
        .innerJoin(suppliers, eq(suppliers.id, deliveries.supplierId))
        .leftJoin(users, eq(users.id, deliveries.signedById))
        .where(where)
        .orderBy(desc(deliveries.deletedAt), asc(deliveries.id))
        .limit(take)
        .offset(skip),
      this.db
        .select({ total: count() })
        .from(deliveries)
        .innerJoin(suppliers, eq(suppliers.id, deliveries.supplierId))
        .where(where),
    ]);

    const visible = rows.filter((row) => ability.can("delete", asSubject("Delivery", row)));
    if (visible.length !== rows.length) {
      this.logger.error(
        `ability push-down disagreed with the in-memory evaluator: ${rows.length - visible.length} of ${rows.length} trashed delivery rows were cut after fetch`,
      );
    }

    return {
      data: visible.map((row) => ({ ...this.toEntity(row), deletedAt: row.deletedAt! })),
      pagination: { skip, take, total: totals?.total ?? 0 },
    };
  }

  /**
   * Restore — no clash to check, unlike containers: the delivery number is never
   * reissued while the row sits in the trash, so the identity is still free.
   */
  async restore(id: string, ability: AppAbility): Promise<BaseResponse<DeliveryEntity>> {
    const existing = await this.requireTrashedRow(id);
    this.assertAllowed(ability, "delete", existing);

    const [restored] = await this.db
      .update(deliveries)
      .set({ deletedAt: null })
      .where(and(eq(deliveries.id, id), isNotNull(deliveries.deletedAt)))
      .returning({ id: deliveries.id });

    if (!restored) throw new NotFoundException("Delivery not found in the trash");

    return { data: this.toEntity(await this.requireRow(restored.id)) };
  }

  /**
   * A new line on the form. The pallet number is assigned here (max + 1 within the
   * delivery), the tare comes from the packing's standard — or from the scale, for
   * `special` — and the worker defaults to whoever is signed in at the station.
   */
  async addPallet(
    deliveryId: string,
    dto: CreatePalletDto,
    ability: AppAbility,
    callerId: string,
  ): Promise<BaseResponse<PalletEntity>> {
    const delivery = await this.requireRow(deliveryId);
    this.assertDraft(delivery);
    this.assertAllowed(ability, "update", delivery);
    // Pallet rows are the `pallets` field of the delivery, the way roles are a field of
    // a user — a rule limited to other fields must not reach them.
    assertFieldsAllowed(ability, asSubject("Delivery", delivery), ["pallets"]);

    const tareKg = this.resolveTareForCreate(dto.packing, dto.tareKg);
    this.assertWeighable(dto.grossWeightKg, tareKg);

    const workerId = dto.workerId ?? callerId;
    if (workerId !== callerId) await this.assertWorker(workerId);

    try {
      const [created] = await this.db
        .insert(pallets)
        .values({
          deliveryId,
          // Assigned in the statement itself so two entries read the same register; the
          // unique index settles the losing side of a tie into the 409 below.
          palletNo: sql`(select coalesce(max(${pallets.palletNo}), 0) + 1 from ${pallets} where ${pallets.deliveryId} = ${deliveryId})`,
          packing: dto.packing,
          material: dto.material,
          weeeCategory: dto.weeeCategory ?? null,
          grossWeightKg: dto.grossWeightKg,
          tareKg,
          quantityPcs: dto.quantityPcs ?? null,
          classification: dto.classification ?? null,
          notice: dto.notice ?? null,
          workerId,
        })
        .returning({ id: pallets.id });

      if (!created) throw new ConflictException("The pallet could not be recorded — try again");

      return { data: this.toPalletEntity(await this.requirePalletRow(deliveryId, created.id)) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          "Another pallet was recorded on this delivery at the same moment — try again",
        );
      }
      throw error;
    }
  }

  async updatePallet(
    deliveryId: string,
    palletId: string,
    dto: UpdatePalletDto,
    ability: AppAbility,
  ): Promise<BaseResponse<PalletEntity>> {
    const delivery = await this.requireRow(deliveryId);
    this.assertDraft(delivery);
    this.assertAllowed(ability, "update", delivery);
    assertFieldsAllowed(ability, asSubject("Delivery", delivery), ["pallets"]);

    const existing = await this.requirePalletRow(deliveryId, palletId);

    // Validated against the row as it will be: a packing change re-resolves the tare,
    // and a gross change still has to clear whatever tare applies afterwards.
    const tareKg = this.resolveTareForUpdate(existing, dto);
    const grossWeightKg = dto.grossWeightKg ?? existing.grossWeightKg;
    this.assertWeighable(grossWeightKg, tareKg);

    if (dto.workerId && dto.workerId !== existing.workerId) {
      await this.assertWorker(dto.workerId);
    }

    // The tare never comes from the body directly — `resolveTareForUpdate` already
    // decided what it must be, and for standard packings that is not the client's call.
    const { tareKg: _sent, ...rest } = dto;
    const patch: Partial<typeof pallets.$inferInsert> = {
      ...rest,
      ...(tareKg !== existing.tareKg ? { tareKg } : {}),
    };

    if (Object.values(patch).every((value) => value === undefined)) {
      return { data: this.toPalletEntity(existing) };
    }

    const [updated] = await this.db
      .update(pallets)
      .set(patch)
      .where(and(eq(pallets.id, palletId), eq(pallets.deliveryId, deliveryId)))
      .returning({ id: pallets.id });

    if (!updated) throw new NotFoundException("Pallet not found");

    return { data: this.toPalletEntity(await this.requirePalletRow(deliveryId, updated.id)) };
  }

  /**
   * A hard delete, the only one in this module: a line struck from an unfinished form
   * was never part of any record. Behind `update Delivery`, not `delete` — removing a
   * line is editing the draft, while `delete` governs trashing the record itself.
   */
  async removePallet(deliveryId: string, palletId: string, ability: AppAbility): Promise<void> {
    const delivery = await this.requireRow(deliveryId);
    this.assertDraft(delivery);
    this.assertAllowed(ability, "update", delivery);
    assertFieldsAllowed(ability, asSubject("Delivery", delivery), ["pallets"]);

    // The photo *rows* go with the pallet (cascade); their bytes are the storage
    // layer's, so the keys are collected first and swept after the delete commits.
    const photos = await this.db
      .select({ storageKey: files.storageKey })
      .from(files)
      .where(eq(files.palletId, palletId));

    const [deleted] = await this.db
      .delete(pallets)
      .where(and(eq(pallets.id, palletId), eq(pallets.deliveryId, deliveryId)))
      .returning({ id: pallets.id });

    if (!deleted) throw new NotFoundException("Pallet not found");

    for (const photo of photos) {
      try {
        await this.storage.delete(photo.storageKey);
      } catch (error) {
        // A stranded object in a private store is a cost, not a leak — log and move on.
        this.logger.warn(
          `could not remove object "${photo.storageKey}" from storage: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /** The columns every delivery read selects — supplier, signer and pallet aggregates. */
  private selection() {
    return {
      ...getTableColumns(deliveries),
      supplierCode: suppliers.code,
      // Flat, folded into objects by `toEntity` — same contract as the containers join.
      signerId: users.id,
      signerEmail: users.email,
      signerName: users.name,
      // Correlated rather than grouped: a page is at most 100 rows, and grouping the
      // whole register to aggregate one page inverts that cost.
      palletCount: sql<number>`(select count(*)::int from ${pallets} where ${pallets.deliveryId} = ${deliveries.id})`,
      totalNetWeightKg: sql<number>`(select coalesce(sum(${pallets.grossWeightKg} - ${pallets.tareKg}), 0)::int from ${pallets} where ${pallets.deliveryId} = ${deliveries.id})`,
    };
  }

  /** Reference, lot number or supplier code — what a person holding paperwork has. */
  private searchWhere(search: string | undefined) {
    if (!search) return undefined;

    const referenceNo = parseDeliveryReference(search);
    const rawTerm = `%${escapeLike(search)}%`;
    const codeTerm = `%${escapeLike(search.toUpperCase())}%`;

    return or(
      ...(referenceNo !== null ? [eq(deliveries.deliveryNo, referenceNo)] : []),
      ilike(deliveries.lotNo, rawTerm),
      ilike(suppliers.code, codeTerm),
    );
  }

  private async requireRow(id: string): Promise<DeliveryRow> {
    const [row] = await this.db
      .select(this.selection())
      .from(deliveries)
      .innerJoin(suppliers, eq(suppliers.id, deliveries.supplierId))
      .leftJoin(users, eq(users.id, deliveries.signedById))
      .where(and(eq(deliveries.id, id), isNull(deliveries.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundException("Delivery not found");
    return row;
  }

  private async requireTrashedRow(id: string): Promise<DeliveryRow> {
    const [row] = await this.db
      .select(this.selection())
      .from(deliveries)
      .innerJoin(suppliers, eq(suppliers.id, deliveries.supplierId))
      .leftJoin(users, eq(users.id, deliveries.signedById))
      .where(and(eq(deliveries.id, id), isNotNull(deliveries.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundException("Delivery not found in the trash");
    return row;
  }

  /** The pallets of one delivery, worker resolved, in floor order. */
  private async palletRows(deliveryId: string): Promise<PalletRow[]> {
    return this.db
      .select({
        ...getTableColumns(pallets),
        workerEmail: users.email,
        workerName: users.name,
      })
      .from(pallets)
      .innerJoin(users, eq(users.id, pallets.workerId))
      .where(eq(pallets.deliveryId, deliveryId))
      .orderBy(asc(pallets.palletNo));
  }

  private async requirePalletRow(deliveryId: string, palletId: string): Promise<PalletRow> {
    const [row] = await this.db
      .select({
        ...getTableColumns(pallets),
        workerEmail: users.email,
        workerName: users.name,
      })
      .from(pallets)
      .innerJoin(users, eq(users.id, pallets.workerId))
      .where(and(eq(pallets.id, palletId), eq(pallets.deliveryId, deliveryId)))
      .limit(1);

    if (!row) throw new NotFoundException("Pallet not found");
    return row;
  }

  private toEntity(row: DeliveryRow): DeliveryEntity {
    const { supplierCode, signerId, signerEmail, signerName, ...delivery } = row;

    return {
      ...delivery,
      reference: formatDeliveryReference(delivery.deliveryNo),
      supplier: { id: delivery.supplierId, code: supplierCode },
      signedBy:
        signerId && signerEmail ? { id: signerId, email: signerEmail, name: signerName } : null,
    };
  }

  private async toDetailEntity(row: DeliveryRow): Promise<DeliveryDetailEntity> {
    const [palletList, fileList] = await Promise.all([this.palletRows(row.id), this.fileRows(row.id)]);

    return {
      ...this.toEntity(row),
      pallets: palletList.map((pallet) => this.toPalletEntity(pallet)),
      files: fileList.map((file) => toFileEntity(file, row)),
    };
  }

  /** The files of one delivery — metadata only; the bytes stream through their own route. */
  private async fileRows(deliveryId: string): Promise<FileRow[]> {
    return this.db
      .select(fileSelection())
      .from(files)
      .leftJoin(pallets, eq(pallets.id, files.palletId))
      .innerJoin(users, eq(users.id, files.uploadedById))
      .where(eq(files.deliveryId, deliveryId))
      .orderBy(asc(files.createdAt), asc(files.id));
  }

  private toPalletEntity(row: PalletRow): PalletEntity {
    const { workerEmail, workerName, ...pallet } = row;

    return {
      ...pallet,
      palletLabel: formatPalletLabel(pallet.palletNo),
      netWeightKg: netWeightKg(pallet.grossWeightKg, pallet.tareKg),
      worker: { id: pallet.workerId, email: workerEmail, name: workerName },
    };
  }

  /**
   * The tare a new pallet must carry: the packing's standard, applied here so a wrong
   * one cannot be filed — or the individually weighed value that `special` requires.
   */
  private resolveTareForCreate(packing: PackingType, sentTareKg: number | undefined): number {
    if (isSpecialPacking(packing)) {
      if (sentTareKg === undefined) {
        throw new BadRequestException(
          `${SPECIAL_PACKING} packing is weighed individually — tareKg is required`,
        );
      }
      return sentTareKg;
    }

    if (sentTareKg !== undefined) {
      throw new BadRequestException(
        `tareKg only applies to ${SPECIAL_PACKING} packing — ${packing} uses its standard tare of ${standardTareKg(packing)} kg`,
      );
    }

    // Non-special packings always have a standard tare; the vocabulary says so.
    return standardTareKg(packing)!;
  }

  /** The same resolution against the row as it will be after the PATCH. */
  private resolveTareForUpdate(existing: Pallet, dto: UpdatePalletDto): number {
    const packing = dto.packing ?? existing.packing;

    if (isSpecialPacking(packing)) {
      const tareKg =
        dto.tareKg ?? (isSpecialPacking(existing.packing) ? existing.tareKg : undefined);
      if (tareKg === undefined) {
        throw new BadRequestException(
          `switching to ${SPECIAL_PACKING} packing requires tareKg — it is weighed individually`,
        );
      }
      return tareKg;
    }

    if (dto.tareKg !== undefined) {
      throw new BadRequestException(
        `tareKg only applies to ${SPECIAL_PACKING} packing — ${packing} uses its standard tare of ${standardTareKg(packing)} kg`,
      );
    }

    return standardTareKg(packing)!;
  }

  /** Net weight is gross minus tare, so a gross at or below the tare describes nothing. */
  private assertWeighable(grossWeightKg: number, tareKg: number): void {
    if (grossWeightKg <= tareKg) {
      throw new BadRequestException(
        "grossWeightKg must exceed the tare — the difference is the net weight",
      );
    }
  }

  /** Immutability is the module's core invariant, so it is asserted before ability. */
  private assertDraft(row: Delivery): void {
    if (row.status !== "draft") {
      throw new ConflictException(
        "A signed delivery is immutable — a correction is a new record, not an edit",
      );
    }
  }

  private async assertSupplier(supplierId: string): Promise<void> {
    const [supplier] = await this.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
      .limit(1);

    if (!supplier) throw new BadRequestException("supplierId is not a live supplier");
  }

  /** Whoever is on record as having checked a pallet must be a live account. */
  private async assertWorker(workerId: string): Promise<void> {
    const [worker] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, workerId), isNull(users.deletedAt)))
      .limit(1);

    if (!worker) throw new BadRequestException("workerId is not a live user");
  }

  /**
   * Re-checks a write against the row it will touch — where a conditional rule
   * (`update Delivery` only where `status` is `draft`, say) actually takes effect.
   */
  private assertAllowed(ability: AppAbility, action: "update" | "delete", row: DeliveryRow): void {
    if (!ability.can(action, asSubject("Delivery", row))) {
      throw new ForbiddenException("Insufficient permissions for this delivery");
    }
  }
}
