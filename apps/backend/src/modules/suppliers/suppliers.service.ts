import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, getTableColumns, ilike, isNotNull, isNull, or } from "drizzle-orm";

import type { AppAbility } from "@repo/access";
import type { Supplier } from "@repo/db";
import { asSubject } from "@repo/access";
import { deliveries, suppliers } from "@repo/db";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { CreateSupplierDto } from "./dto/create-supplier.dto";
import type { ListSuppliersDto, ListTrashedSuppliersDto } from "./dto/list-suppliers.dto";
import type { UpdateSupplierDto } from "./dto/update-supplier.dto";
import type { SupplierEntity, TrashedSupplierEntity } from "./entities/supplier.entity";
import { abilityWhere } from "../../lib/ability/ability-where";
import { assertFieldsAllowed, touchedFields } from "../../lib/ability/field-access";
import { DRIZZLE } from "../../lib/db/db.module";
import { escapeLike, isUniqueViolation } from "../../lib/sql.utils";

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * A page of suppliers, ordered by code: the list is a register, and whoever opens it
   * is holding a delivery note with a code on it. The code is unique among live rows,
   * so it is also a stable paging key.
   */
  async list(query: ListSuppliersDto, ability: AppAbility): Promise<BaseResponse<SupplierEntity[]>> {
    const { skip, take, search } = query;

    // The code is stored uppercase, so the term is matched uppercase against it and
    // as-typed against the name — uppercasing a company name would stop it matching.
    const codeTerm = search ? `%${escapeLike(search.toUpperCase())}%` : undefined;
    const rawTerm = search ? `%${escapeLike(search)}%` : undefined;

    const where = and(
      isNull(suppliers.deletedAt),
      abilityWhere(ability, "read", "Supplier", getTableColumns(suppliers)),
      codeTerm && rawTerm
        ? or(ilike(suppliers.code, codeTerm), ilike(suppliers.name, rawTerm))
        : undefined,
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(suppliers)
        .where(where)
        .orderBy(asc(suppliers.code))
        .limit(take)
        .offset(skip),
      this.db.select({ total: count() }).from(suppliers).where(where),
    ]);

    // The same canary as the containers list: the push-down compiled the caller's rules
    // exactly, so this filter must keep every row and logs loudly if it ever cuts one.
    const visible = rows.filter((row) => ability.can("read", asSubject("Supplier", row)));
    if (visible.length !== rows.length) {
      this.logger.error(
        `ability push-down disagreed with the in-memory evaluator: ${rows.length - visible.length} of ${rows.length} supplier rows were cut after fetch`,
      );
    }

    return { data: visible, pagination: { skip, take, total: totals?.total ?? 0 } };
  }

  async findOne(id: string, ability: AppAbility): Promise<BaseResponse<SupplierEntity>> {
    const row = await this.requireRow(id);

    // 404 rather than 403 when a condition excludes it — same reasoning as containers:
    // naming the row as forbidden would confirm it exists.
    if (!ability.can("read", asSubject("Supplier", row))) {
      throw new NotFoundException("Supplier not found");
    }

    return { data: row };
  }

  async create(dto: CreateSupplierDto): Promise<BaseResponse<SupplierEntity>> {
    // Checked up front so the common case is a clean 409; the partial unique index is
    // what actually guarantees it.
    const existing = await this.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.code, dto.code), isNull(suppliers.deletedAt)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException("A supplier with that code already exists");
    }

    try {
      const [created] = await this.db
        .insert(suppliers)
        .values({ code: dto.code, name: dto.name, notes: dto.notes ?? null })
        .returning();

      if (!created) throw new ConflictException("A supplier with that code already exists");
      return { data: created };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A supplier with that code already exists");
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
    ability: AppAbility,
  ): Promise<BaseResponse<SupplierEntity>> {
    const existing = await this.requireRow(id);
    this.assertAllowed(ability, "update", existing);
    assertFieldsAllowed(ability, asSubject("Supplier", existing), touchedFields(dto));

    if (dto.code && dto.code !== existing.code) {
      const clash = await this.db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.code, dto.code), isNull(suppliers.deletedAt)))
        .limit(1);

      if (clash.length > 0) {
        throw new ConflictException("A supplier with that code already exists");
      }
    }

    // Tested by value, not key count — the DTO is a class, so absent fields are own
    // keys holding `undefined`, and an empty PATCH must not move `updated_at`.
    if (Object.values(dto).every((value) => value === undefined)) {
      return { data: existing };
    }

    try {
      const [updated] = await this.db
        .update(suppliers)
        .set({ ...dto })
        .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
        .returning();

      if (!updated) throw new NotFoundException("Supplier not found");
      return { data: updated };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A supplier with that code already exists");
      }
      throw error;
    }
  }

  /**
   * Soft delete — refused once any delivery references the supplier.
   *
   * Not just live deliveries: a draft sitting in the trash still resolves its supplier,
   * and restoring it must not resurrect a reference to a deleted row. Deleting is for a
   * supplier that should never have been entered, and such a supplier has no deliveries.
   */
  async softDelete(id: string, ability: AppAbility): Promise<void> {
    const existing = await this.requireRow(id);
    this.assertAllowed(ability, "delete", existing);

    const [referenced] = await this.db
      .select({ total: count() })
      .from(deliveries)
      .where(eq(deliveries.supplierId, id));

    if ((referenced?.total ?? 0) > 0) {
      throw new ConflictException(
        "This supplier has recorded deliveries and cannot be deleted — goods-in records must keep resolving their supplier",
      );
    }

    const [deleted] = await this.db
      .update(suppliers)
      .set({ deletedAt: new Date() })
      .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
      .returning({ id: suppliers.id });

    if (!deleted) throw new NotFoundException("Supplier not found");
  }

  /** The trash — gated by `delete Supplier`, exactly like the containers trash. */
  async listTrash(
    query: ListTrashedSuppliersDto,
    ability: AppAbility,
  ): Promise<BaseResponse<TrashedSupplierEntity[]>> {
    const { skip, take, search } = query;

    const codeTerm = search ? `%${escapeLike(search.toUpperCase())}%` : undefined;
    const rawTerm = search ? `%${escapeLike(search)}%` : undefined;

    const where = and(
      isNotNull(suppliers.deletedAt),
      abilityWhere(ability, "delete", "Supplier", getTableColumns(suppliers)),
      codeTerm && rawTerm
        ? or(ilike(suppliers.code, codeTerm), ilike(suppliers.name, rawTerm))
        : undefined,
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(suppliers)
        .where(where)
        .orderBy(desc(suppliers.deletedAt), asc(suppliers.id))
        .limit(take)
        .offset(skip),
      this.db.select({ total: count() }).from(suppliers).where(where),
    ]);

    const visible = rows.filter((row) => ability.can("delete", asSubject("Supplier", row)));
    if (visible.length !== rows.length) {
      this.logger.error(
        `ability push-down disagreed with the in-memory evaluator: ${rows.length - visible.length} of ${rows.length} trashed supplier rows were cut after fetch`,
      );
    }

    return {
      data: visible.map((row) => ({ ...row, deletedAt: row.deletedAt! })),
      pagination: { skip, take, total: totals?.total ?? 0 },
    };
  }

  /** Restore — with the same code-clash check as containers, for the same partial index. */
  async restore(id: string, ability: AppAbility): Promise<BaseResponse<SupplierEntity>> {
    const existing = await this.requireTrashedRow(id);
    this.assertAllowed(ability, "delete", existing);

    const clash = await this.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.code, existing.code), isNull(suppliers.deletedAt)))
      .limit(1);

    if (clash.length > 0) {
      throw new ConflictException(
        "A live supplier now holds that code — change or delete it before restoring this one",
      );
    }

    try {
      const [restored] = await this.db
        .update(suppliers)
        .set({ deletedAt: null })
        .where(and(eq(suppliers.id, id), isNotNull(suppliers.deletedAt)))
        .returning();

      if (!restored) throw new NotFoundException("Supplier not found in the trash");
      return { data: restored };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          "A live supplier now holds that code — change or delete it before restoring this one",
        );
      }
      throw error;
    }
  }

  private async requireRow(id: string): Promise<Supplier> {
    const [row] = await this.db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundException("Supplier not found");
    return row;
  }

  private async requireTrashedRow(id: string): Promise<Supplier> {
    const [row] = await this.db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), isNotNull(suppliers.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundException("Supplier not found in the trash");
    return row;
  }

  /** Re-checks a write against the row it touches — where conditional rules take effect. */
  private assertAllowed(ability: AppAbility, action: "update" | "delete", row: Supplier): void {
    if (!ability.can(action, asSubject("Supplier", row))) {
      throw new ForbiddenException("Insufficient permissions for this supplier");
    }
  }
}
