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
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import type { AppAbility } from "@repo/access";
import type { Container } from "@repo/db";
import { asSubject } from "@repo/access";
import { containers, users } from "@repo/db";
import { normalizeContainerNumber, payloadKg, REEFER_TYPE } from "@repo/shipping";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { CreateContainerDto } from "./dto/create-container.dto";
import type { ListContainersDto } from "./dto/list-containers.dto";
import type { UpdateContainerDto } from "./dto/update-container.dto";
import type { ContainerEntity } from "./entities/container.entity";
import { abilityWhere } from "../../lib/ability/ability-where";
import { assertFieldsAllowed, touchedFields } from "../../lib/ability/field-access";
import { DRIZZLE } from "../../lib/db/db.module";
import { escapeLike, isUniqueViolation } from "../../lib/sql.utils";
import { UNASSIGNED } from "./dto/list-containers.dto";

/** How far ahead a CSC examination counts as due. A month is the notice a depot needs. */
const INSPECTION_WINDOW_DAYS = 30;

/** A row joined with its assignee, before serialization. */
interface ContainerRow extends Container {
  assigneeId: string | null;
  assigneeEmail: string | null;
  assigneeName: string | null;
}

@Injectable()
export class ContainersService {
  private readonly logger = new Logger(ContainersService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * A page of containers, filtered by what the caller's own rules allow.
   *
   * Ordered by container number rather than newest-first, unlike the users list: a fleet
   * list is a register, and someone holding a box in front of them is looking for *that*
   * number. The number is unique among live rows, so it is also a stable paging key with
   * no tiebreaker needed.
   *
   * The caller's rules are compiled into the query — exactly, or `abilityWhere` throws;
   * every storable rule compiles because rule writes are validated with the same
   * translation. `total` is therefore the number of boxes the caller can actually see,
   * and a page comes back full. The per-row re-check below is a canary, not enforcement:
   * it should never remove a row, and logs loudly if it ever does.
   */
  async list(
    query: ListContainersDto,
    ability: AppAbility,
  ): Promise<BaseResponse<ContainerEntity[]>> {
    const { skip, take, search, status, type, condition, sizeFt, assignedToId, inspectionDue } =
      query;

    // Normalized before matching, so pasting `mscu 123456` finds a row stored as
    // `MSCU1234565` — neither the space nor the lowercase is in the column.
    const term = search ? `%${escapeLike(normalizeContainerNumber(search))}%` : undefined;
    const rawTerm = search ? `%${escapeLike(search)}%` : undefined;

    const where = and(
      isNull(containers.deletedAt),
      // The caller's `read Container` conditions, compiled into SQL — exactly, or not at
      // all. See `abilityWhere`.
      abilityWhere(ability, "read", "Container", getTableColumns(containers)),
      status ? eq(containers.status, status) : undefined,
      type ? eq(containers.type, type) : undefined,
      condition ? eq(containers.condition, condition) : undefined,
      sizeFt ? eq(containers.sizeFt, sizeFt) : undefined,
      assignedToId === UNASSIGNED
        ? isNull(containers.assignedToId)
        : assignedToId
          ? eq(containers.assignedToId, assignedToId)
          : undefined,
      inspectionDue
        ? and(
            isNotNull(containers.nextInspectionOn),
            // Computed in SQL rather than in JS: the comparison has to happen in the
            // database's clock and type, or a box due today lands on the wrong side of it.
            lte(
              containers.nextInspectionOn,
              sql`(current_date + ${sql.raw(`interval '${INSPECTION_WINDOW_DAYS} days'`)})`,
            ),
          )
        : undefined,
      // The number is matched against the normalized term, the human fields against what
      // was actually typed — uppercasing a depot name would stop it matching.
      term && rawTerm
        ? or(
            ilike(containers.containerNumber, term),
            ilike(containers.operator, rawTerm),
            ilike(containers.depot, rawTerm),
          )
        : undefined,
    );

    const [rows, [totals]] = await Promise.all([
      this.db
        .select(this.selection())
        .from(containers)
        .leftJoin(users, eq(users.id, containers.assignedToId))
        .where(where)
        .orderBy(asc(containers.containerNumber))
        .limit(take)
        .offset(skip),
      this.db.select({ total: count() }).from(containers).where(where),
    ]);

    // The canary: `abilityWhere` compiled these rules exactly, so this filter must keep
    // every row. A row cut here means the SQL and in-memory evaluators disagreed — a
    // translator bug — so the mismatch is logged as an error while the caller still gets
    // the safe (filtered) answer.
    const visible = rows.filter((row) => ability.can("read", asSubject("Container", row)));
    if (visible.length !== rows.length) {
      this.logger.error(
        `ability push-down disagreed with the in-memory evaluator: ${rows.length - visible.length} of ${rows.length} container rows were cut after fetch`,
      );
    }

    return {
      data: visible.map((row) => this.toEntity(row)),
      pagination: { skip, take, total: totals?.total ?? 0 },
    };
  }

  async findOne(id: string, ability: AppAbility): Promise<BaseResponse<ContainerEntity>> {
    const row = await this.requireRow(id);

    // 404 rather than 403 when a condition excludes it: the caller may read containers, so
    // naming this one as forbidden would confirm a box exists to someone whose rules were
    // written to keep it out of view.
    if (!ability.can("read", asSubject("Container", row))) {
      throw new NotFoundException("Container not found");
    }

    return { data: this.toEntity(row) };
  }

  async create(dto: CreateContainerDto): Promise<BaseResponse<ContainerEntity>> {
    this.assertPlate(dto.tareWeightKg, dto.maxGrossWeightKg);
    this.assertReefer(dto.type, dto.reeferSetpointC ?? null);

    if (dto.assignedToId) await this.assertAssignee(dto.assignedToId);

    // Checked up front so the common case is a clean 409 rather than a database error; the
    // partial unique index is what actually guarantees it.
    const existing = await this.db
      .select({ id: containers.id })
      .from(containers)
      .where(and(eq(containers.containerNumber, dto.containerNumber), isNull(containers.deletedAt)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException("A container with that number already exists");
    }

    try {
      const [created] = await this.db
        .insert(containers)
        .values({
          containerNumber: dto.containerNumber,
          isoTypeCode: dto.isoTypeCode ?? null,
          type: dto.type,
          sizeFt: dto.sizeFt,
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.condition ? { condition: dto.condition } : {}),
          tareWeightKg: dto.tareWeightKg,
          maxGrossWeightKg: dto.maxGrossWeightKg,
          cubicCapacityM3: dto.cubicCapacityM3 ?? null,
          operator: dto.operator ?? null,
          unlocode: dto.unlocode ?? null,
          depot: dto.depot ?? null,
          manufacturedOn: dto.manufacturedOn ?? null,
          nextInspectionOn: dto.nextInspectionOn ?? null,
          reeferSetpointC: dto.reeferSetpointC ?? null,
          notes: dto.notes ?? null,
          assignedToId: dto.assignedToId ?? null,
        })
        .returning({ id: containers.id });

      if (!created) throw new ConflictException("A container with that number already exists");

      // Re-read through the join so the response carries the assignee the same way every
      // other read does, rather than a shape assembled only on this path.
      return { data: this.toEntity(await this.requireRow(created.id)) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A container with that number already exists");
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateContainerDto,
    ability: AppAbility,
  ): Promise<BaseResponse<ContainerEntity>> {
    const existing = await this.requireRow(id);
    const subject = asSubject("Container", existing);
    this.assertAllowed(ability, "update", existing);

    // Which columns, having established which row. A rule may be narrowed to a set of
    // fields, and the guard could not see the body: `update Container` limited to
    // `["status", "depot"]` is a yard hand who moves boxes without re-plating them.
    //
    // The setpoint cleared below is not checked against this list. It is a consequence of
    // a permitted change to `type`, not a field the caller named, and the alternative —
    // leaving a dry box with a temperature — is a record that lies.
    assertFieldsAllowed(ability, subject, touchedFields(dto));

    // Validated against the row as it will be, not as it was: changing only the tare still
    // has to leave a payload that makes sense against the stored gross.
    const tare = dto.tareWeightKg ?? existing.tareWeightKg;
    const gross = dto.maxGrossWeightKg ?? existing.maxGrossWeightKg;
    this.assertPlate(tare, gross);

    const type = dto.type ?? existing.type;
    const setpoint =
      dto.reeferSetpointC !== undefined ? dto.reeferSetpointC : existing.reeferSetpointC;

    // A box converted away from reefer keeps no setpoint. Cleared rather than refused: the
    // operator's intent is clear, and making them empty a field they cannot see on a dry
    // container would be a puzzle rather than a safeguard.
    const clearedSetpoint = type !== REEFER_TYPE ? null : setpoint;
    if (dto.reeferSetpointC != null) this.assertReefer(type, dto.reeferSetpointC);

    if (dto.assignedToId) await this.assertAssignee(dto.assignedToId);

    if (dto.containerNumber && dto.containerNumber !== existing.containerNumber) {
      const clash = await this.db
        .select({ id: containers.id })
        .from(containers)
        .where(
          and(eq(containers.containerNumber, dto.containerNumber), isNull(containers.deletedAt)),
        )
        .limit(1);

      if (clash.length > 0) {
        throw new ConflictException("A container with that number already exists");
      }
    }

    const patch: Partial<typeof containers.$inferInsert> = {
      ...dto,
      ...(clearedSetpoint !== setpoint ? { reeferSetpointC: clearedSetpoint } : {}),
    };

    // Tested by value, not by key count: the DTO is a class, so a field the client never
    // sent is still an own key holding `undefined`. An empty PATCH is not an error, but
    // writing it would move `updated_at` and make an audit trail claim a change that never
    // happened — and Drizzle throws when every value is undefined.
    if (Object.values(patch).every((value) => value === undefined)) {
      return { data: this.toEntity(existing) };
    }

    try {
      const [updated] = await this.db
        .update(containers)
        .set(patch)
        .where(and(eq(containers.id, id), isNull(containers.deletedAt)))
        .returning({ id: containers.id });

      // Deleted between the read and the write.
      if (!updated) throw new NotFoundException("Container not found");

      return { data: this.toEntity(await this.requireRow(updated.id)) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A container with that number already exists");
      }
      throw error;
    }
  }

  /**
   * Soft delete, as everywhere else — the row stays and `deleted_at` is stamped.
   *
   * This is not how a scrapped box is recorded: that is `status: "retired"`, which keeps it
   * in the fleet list where its history still resolves. Deleting is for a row that should
   * not have existed, and the partial unique index means the number becomes free again.
   */
  async softDelete(id: string, ability: AppAbility): Promise<void> {
    const existing = await this.requireRow(id);
    this.assertAllowed(ability, "delete", existing);

    const [deleted] = await this.db
      .update(containers)
      .set({ deletedAt: new Date() })
      // `isNull` makes this idempotent-by-omission: deleting twice reports 404 rather than
      // silently moving the deletion timestamp forward.
      .where(and(eq(containers.id, id), isNull(containers.deletedAt)))
      .returning({ id: containers.id });

    if (!deleted) throw new NotFoundException("Container not found");
  }

  /** The columns every read selects, assignee included. */
  private selection() {
    return {
      ...getTableColumns(containers),
      // Flat, then folded into an object by `toEntity`: a nested select would hand back an
      // object of nulls for an unassigned box, which reads as "assigned to nobody in
      // particular" rather than "not assigned".
      assigneeId: users.id,
      assigneeEmail: users.email,
      assigneeName: users.name,
    };
  }

  private async requireRow(id: string): Promise<ContainerRow> {
    const [row] = await this.db
      .select(this.selection())
      .from(containers)
      .leftJoin(users, eq(users.id, containers.assignedToId))
      .where(and(eq(containers.id, id), isNull(containers.deletedAt)))
      .limit(1);

    if (!row) throw new NotFoundException("Container not found");
    return row;
  }

  /**
   * Folds a joined row into the shape the entity's allowlist expects.
   *
   * `deletedAt` rides along and is dropped by the allowlist — the same contract every other
   * module here relies on, where the entity decides the wire format rather than the query.
   */
  private toEntity(row: ContainerRow): ContainerEntity {
    const { assigneeId, assigneeEmail, assigneeName, ...container } = row;

    return {
      ...container,
      payloadKg: payloadKg(container.tareWeightKg, container.maxGrossWeightKg),
      assignedTo:
        assigneeId && assigneeEmail
          ? { id: assigneeId, email: assigneeEmail, name: assigneeName }
          : null,
    };
  }

  /** Payload is gross minus tare, so a gross at or below the tare describes no container. */
  private assertPlate(tareWeightKg: number, maxGrossWeightKg: number): void {
    if (maxGrossWeightKg <= tareWeightKg) {
      throw new BadRequestException(
        "maxGrossWeightKg must exceed tareWeightKg — the difference is the payload",
      );
    }
  }

  /**
   * A setpoint on anything but a reefer is refused rather than stored.
   *
   * A dry box with a temperature recorded against it is how a fleet report ends up claiming
   * a general-purpose container runs at -18°C, and nothing downstream would flag it.
   */
  private assertReefer(type: string, setpoint: number | null): void {
    if (setpoint !== null && type !== REEFER_TYPE) {
      throw new BadRequestException(`reeferSetpointC only applies to a ${REEFER_TYPE} container`);
    }
  }

  /** The assignee must be a live account: a dangling id would render as a blank name. */
  private async assertAssignee(userId: string): Promise<void> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!user) throw new BadRequestException("assignedToId is not a live user");
  }

  /**
   * Re-checks a write against the row it will touch.
   *
   * The route guard only established that the caller may update *some* container — it had
   * no row to match a rule's conditions against, so this is where "only the boxes assigned
   * to you" actually takes effect.
   */
  private assertAllowed(ability: AppAbility, action: "update" | "delete", row: ContainerRow): void {
    if (!ability.can(action, asSubject("Container", row))) {
      throw new ForbiddenException("Insufficient permissions for this container");
    }
  }
}
