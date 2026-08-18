import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  or,
} from "drizzle-orm";

import type { AppAbility } from "@repo/access";
import { asSubject, isSuperRole, permissionKey, SUPER_ROLE_KEY } from "@repo/access";
import { permissions, rolePermissions, roles, userRoles, users } from "@repo/db";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { CreateRoleDto } from "./dto/create-role.dto";
import type { ListRolesDto } from "./dto/list-roles.dto";
import type { RuleDto } from "./dto/rule.dto";
import type { SetRolePermissionsDto } from "./dto/set-role-permissions.dto";
import type { UpdateRoleDto } from "./dto/update-role.dto";
import type { RoleDetailEntity, RoleEntity, RoleRuleEntity } from "./entities/role.entity";
import { assertFieldsAllowed, touchedFields } from "../../lib/ability/field-access";
import { DRIZZLE } from "../../lib/db/db.module";
import { escapeLike, isUniqueViolation } from "../../lib/sql.utils";

/** A role as anything that only needs to name one sees it. */
export interface RoleRef {
  id: string;
  key: string;
  name: string;
}

@Injectable()
export class RolesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(query: ListRolesDto): Promise<BaseResponse<RoleEntity[]>> {
    const { skip, take, search } = query;

    const term = search ? `%${escapeLike(search)}%` : undefined;
    const where = term ? or(ilike(roles.key, term), ilike(roles.name, term)) : undefined;

    const [rows, [totals]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(roles),
          // `countDistinct`, not `count`: two left joins multiply each other's rows, so
          // a role with 3 permissions and 2 holders would otherwise report 6 of each.
          permissionCount: countDistinct(rolePermissions.permissionId),
          // Counted on `users.id` through a join that filters soft-deleted rows, so this
          // means "live accounts holding this role". A soft delete leaves the assignment
          // in place — deliberately, since undeleting a user should restore what they had —
          // but counting those would tell an operator a role is in use by nobody they can
          // see, and `remove` below would then refuse a deletion they cannot unblock.
          userCount: countDistinct(users.id),
        })
        .from(roles)
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .leftJoin(userRoles, eq(userRoles.roleId, roles.id))
        .leftJoin(users, and(eq(users.id, userRoles.userId), isNull(users.deletedAt)))
        .where(where)
        .groupBy(roles.id)
        // System roles first, then alphabetical: the two an install always has are the
        // ones an operator is looking for, and `name` alone would bury them.
        .orderBy(asc(roles.isSystem), asc(roles.name))
        .limit(take)
        .offset(skip),
      this.db.select({ total: count() }).from(roles).where(where),
    ]);

    return {
      data: rows.map((row) => ({ ...row, isLocked: isSuperRole(row.key) })),
      pagination: { skip, take, total: totals?.total ?? 0 },
    };
  }

  async findOne(id: string): Promise<BaseResponse<RoleDetailEntity>> {
    const role = await this.requireRole(id);

    const [rules, holders] = await Promise.all([this.rulesFor(id), this.liveHolderCount(id)]);

    return {
      data: {
        ...role,
        isLocked: isSuperRole(role.key),
        userCount: holders,
        rules,
      },
    };
  }

  async create(dto: CreateRoleDto): Promise<BaseResponse<RoleDetailEntity>> {
    // Resolved before the insert so a bad rule fails without leaving an empty role
    // behind — a create that half-succeeded is worse than one that did not.
    const grants = dto.rules ? await this.resolveRules(dto.rules) : [];

    try {
      const created = await this.db.transaction(async (tx) => {
        const [role] = await tx
          .insert(roles)
          .values({
            key: dto.key,
            name: dto.name,
            description: dto.description ?? null,
            // Only the seed creates system roles: `isSystem` is what makes a role
            // undeletable, so accepting it from a request would let anyone mint a role
            // nobody can remove.
            isSystem: false,
          })
          .returning();

        if (!role) throw new ConflictException("A role with that key already exists");

        if (grants.length > 0) {
          await tx
            .insert(rolePermissions)
            .values(grants.map((grant) => ({ ...grant, roleId: role.id })));
        }

        return role;
      });

      return {
        data: {
          ...created,
          isLocked: false,
          userCount: 0,
          rules: await this.rulesFor(created.id),
        },
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A role with that key already exists");
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    ability: AppAbility,
  ): Promise<BaseResponse<RoleDetailEntity>> {
    const existing = await this.requireRole(id);

    // Which columns of the role the caller may write. Nothing here narrows *which roles*
    // are editable — a role has no owner for a condition to match on — so unlike the users
    // and containers services this is the only per-row check there is to make.
    assertFieldsAllowed(ability, asSubject("Role", existing), touchedFields(dto));

    // A system role's key is what code refers to — `SUPER_ROLE_KEY`, the seed, the
    // migration's backfill — so renaming it would break the install silently. The
    // display name stays editable, which is what an operator actually wants.
    if (existing.isSystem && dto.key !== undefined && dto.key !== existing.key) {
      throw new ForbiddenException("A system role's key cannot be changed");
    }

    const patch = { key: dto.key, name: dto.name, description: dto.description };

    // Same reasoning as the users service: an empty PATCH is not an error, but writing
    // it would move `updated_at` and make an audit trail claim a change that never
    // happened. Drizzle also throws on a set with no defined values.
    if (Object.values(patch).every((value) => value === undefined)) {
      return this.findOne(id);
    }

    try {
      const [updated] = await this.db.update(roles).set(patch).where(eq(roles.id, id)).returning();
      if (!updated) throw new NotFoundException("Role not found");
      return this.findOne(updated.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A role with that key already exists");
      }
      throw error;
    }
  }

  /**
   * Replaces a role's rules wholesale, in one transaction.
   *
   * Delete-then-insert rather than a diff: the payload *is* the desired state, so
   * computing which cells changed would add a comparison that can be wrong to an
   * operation that is otherwise total. Nothing reads these rows mid-transaction —
   * abilities are resolved per request, so the swap is invisible.
   */
  async setPermissions(
    id: string,
    dto: SetRolePermissionsDto,
    ability: AppAbility,
  ): Promise<BaseResponse<RoleDetailEntity>> {
    const role = await this.requireRole(id);

    // What a role grants is a field of the role, and the one that matters: `update Role`
    // narrowed to `["name", "description"]` is permission to tidy up the role list
    // without permission to change anybody's access. Without this check that rule would
    // pass the guard and then be ignored here, which is the failure mode that looks like
    // it works.
    assertFieldsAllowed(ability, asSubject("Role", role), ["permissions"]);

    // The superuser role's rules live in code (`SYSTEM_ROLES`), not in this table's
    // editable surface. Allowing the matrix to strip `manage all` would let an
    // operator lock every account out of the install with two clicks and no undo.
    if (isSuperRole(role.key)) {
      throw new ForbiddenException(
        `The "${SUPER_ROLE_KEY}" role always has full access and cannot be edited`,
      );
    }

    const grants = await this.resolveRules(dto.rules);

    await this.db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
      if (grants.length > 0) {
        await tx.insert(rolePermissions).values(grants.map((grant) => ({ ...grant, roleId: id })));
      }
    });

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const role = await this.requireRole(id);

    if (role.isSystem) {
      throw new ForbiddenException("A system role cannot be deleted");
    }

    const holders = await this.liveHolderCount(id);

    // The foreign key would cascade this away happily, which is exactly the problem:
    // deleting a role would silently strip permissions from everyone holding it. Making
    // the operator unassign first turns an invisible side effect into a decision.
    if (holders > 0) {
      throw new ConflictException(
        `${holders} ${holders === 1 ? "user holds" : "users hold"} this role — reassign them first`,
      );
    }

    await this.db.delete(roles).where(eq(roles.id, id));
  }

  /** Resolves ids to roles, refusing the whole set if any is unknown. */
  async requireRoles(ids: string[]): Promise<RoleRef[]> {
    if (ids.length === 0) return [];

    const found = await this.db
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(roles)
      .where(inArray(roles.id, ids));

    if (found.length !== ids.length) {
      const known = new Set(found.map((role) => role.id));
      const missing = ids.filter((id) => !known.has(id));
      throw new BadRequestException(
        `Unknown role ${missing.length > 1 ? "ids" : "id"}: ${missing.join(", ")}`,
      );
    }

    return found;
  }

  /** The roles held by each of these users, keyed by user id. */
  async forUsers(userIds: string[]): Promise<Map<string, RoleRef[]>> {
    const byUser = new Map<string, RoleRef[]>(userIds.map((id) => [id, []]));
    if (userIds.length === 0) return byUser;

    const rows = await this.db
      .select({
        userId: userRoles.userId,
        id: roles.id,
        key: roles.key,
        name: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds))
      .orderBy(asc(roles.name));

    for (const row of rows) {
      byUser.get(row.userId)?.push({ id: row.id, key: row.key, name: row.name });
    }

    return byUser;
  }

  /** Ids of the roles that grant unrestricted access — the ones lockout protection watches. */
  async superRoleIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, SUPER_ROLE_KEY));

    return rows.map((row) => row.id);
  }

  /**
   * How many live accounts hold this role.
   *
   * Soft-deleted users are excluded everywhere this number is used — the console shows it
   * as "users", and `remove` refuses a deletion because of it, so counting accounts that
   * no longer exist would block an operator on something they cannot see or undo.
   */
  private async liveHolderCount(roleId: string): Promise<number> {
    const [holders] = await this.db
      .select({ total: count() })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.roleId, roleId), isNull(users.deletedAt)));

    return holders?.total ?? 0;
  }

  private async rulesFor(roleId: string): Promise<RoleRuleEntity[]> {
    const rows = await this.db
      .select({
        permissionId: permissions.id,
        action: permissions.action,
        subject: permissions.subject,
        conditions: rolePermissions.conditions,
        fields: rolePermissions.fields,
        inverted: rolePermissions.inverted,
        reason: rolePermissions.reason,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId))
      .orderBy(asc(permissions.subject), asc(permissions.action));

    return rows as RoleRuleEntity[];
  }

  private async requireRole(id: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!role) throw new NotFoundException("Role not found");
    return role;
  }

  /**
   * Turns (action, subject) pairs into catalog ids.
   *
   * This is where the catalog earns its place: a pair that is not in it cannot be
   * granted, so a role can never hold a rule that no guard will ever ask about. The
   * duplicate check is here too — the composite primary key would raise a unique
   * violation, but "you sent this cell twice" is a clearer answer than a 409.
   */
  private async resolveRules(rules: RuleDto[]) {
    if (rules.length === 0) return [];

    const seen = new Set<string>();
    for (const rule of rules) {
      const key = permissionKey(rule.action, rule.subject);
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicate rule for ${key}`);
      }
      seen.add(key);
    }

    const catalog = await this.db
      .select({ id: permissions.id, action: permissions.action, subject: permissions.subject })
      .from(permissions)
      .where(
        or(
          ...rules.map((rule) =>
            and(eq(permissions.action, rule.action), eq(permissions.subject, rule.subject)),
          ),
        ),
      );

    const idByKey = new Map(catalog.map((row) => [permissionKey(row.action, row.subject), row.id]));

    return rules.map((rule) => {
      const permissionId = idByKey.get(permissionKey(rule.action, rule.subject));
      if (!permissionId) {
        throw new BadRequestException(
          `${permissionKey(rule.action, rule.subject)} is not a grantable permission`,
        );
      }

      return {
        permissionId,
        conditions: rule.conditions ?? null,
        fields: rule.fields && rule.fields.length > 0 ? rule.fields : null,
        inverted: rule.inverted ?? false,
        reason: rule.reason ?? null,
      };
    });
  }
}
