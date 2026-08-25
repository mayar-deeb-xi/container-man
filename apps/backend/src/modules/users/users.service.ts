import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  exists,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  ne,
  or,
} from "drizzle-orm";

import type { AppAbility, AppRule } from "@repo/access";
import type { User } from "@repo/db";
import { asSubject, DEFAULT_ROLE_KEY, SUPER_ROLE_KEY } from "@repo/access";
import { hashPassword } from "@repo/auth/password";
import { roles, sessions, userRoles, users } from "@repo/db";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { RoleRef } from "../roles/roles.service";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { ListUsersDto } from "./dto/list-users.dto";
import type { SetUserRolesDto } from "./dto/set-user-roles.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { UserEntity } from "./entities/user.entity";
import { abilityWhere } from "../../lib/ability/ability-where";
import { AbilityService } from "../../lib/ability/ability.service";
import { assertFieldsAllowed, touchedFields } from "../../lib/ability/field-access";
import { DRIZZLE } from "../../lib/db/db.module";
import { escapeLike, isUniqueViolation } from "../../lib/sql.utils";
import { RolesService } from "../roles/roles.service";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly roles: RolesService,
    private readonly abilities: AbilityService,
  ) {}

  /**
   * Every read below filters on `deleted_at is null`. That predicate is the whole
   * contract of the soft delete: leave it off anywhere and a deleted user starts
   * authenticating again, which is the failure mode this design exists to avoid.
   */
  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email.trim().toLowerCase()), isNull(users.deletedAt)))
      .limit(1);
    return user;
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return user;
  }

  /**
   * A page of users, filtered by whatever the caller's own `read User` rules allow.
   *
   * The caller's conditions are compiled into the query — exactly, or `abilityWhere`
   * throws; every storable rule compiles because rule writes are validated with the same
   * translation. `total` therefore counts what the caller can see, and a page comes back
   * full. The per-row re-check below is a canary, not enforcement: it should never
   * remove a row, and logs loudly if it ever does, because a disagreement between the
   * two evaluators is a translator bug in whichever direction it points.
   */
  async list(query: ListUsersDto, ability: AppAbility): Promise<BaseResponse<UserEntity[]>> {
    const { skip, take, search, roleKey } = query;

    const term = search ? `%${escapeLike(search)}%` : undefined;
    const where = and(
      isNull(users.deletedAt),
      // The caller's `read User` conditions, compiled into SQL — exactly, or not at all.
      // See `abilityWhere`.
      abilityWhere(ability, "read", "User", getTableColumns(users)),
      term ? or(ilike(users.email, term), ilike(users.name, term)) : undefined,
      // `exists` rather than a join: a user with three roles must still be one row, and
      // joining then de-duplicating would make `take` mean something other than "this
      // many users".
      roleKey
        ? exists(
            this.db
              .select({ one: userRoles.userId })
              .from(userRoles)
              .innerJoin(roles, eq(roles.id, userRoles.roleId))
              .where(and(eq(userRoles.userId, users.id), eq(roles.key, roleKey))),
          )
        : undefined,
    );

    // The count runs alongside the page rather than after it: the two are
    // independent, and a list endpoint is the one place where the extra round
    // trip would be paid on every request.
    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        // Newest first, with `id` as a tiebreaker — two users created in the same
        // millisecond would otherwise be free to swap places between pages, which
        // shows up as a row appearing twice while paging.
        .orderBy(desc(users.createdAt), desc(users.id))
        .limit(take)
        .offset(skip),
      this.db.select({ total: count() }).from(users).where(where),
    ]);

    // The canary: `abilityWhere` compiled these rules exactly, so this filter must keep
    // every row. A row cut here means the SQL and in-memory evaluators disagreed — a
    // translator bug — so the mismatch is logged as an error while the caller still gets
    // the safe (filtered) answer.
    const visible = rows.filter((row) => ability.can("read", asSubject("User", row)));
    if (visible.length !== rows.length) {
      this.logger.error(
        `ability push-down disagreed with the in-memory evaluator: ${rows.length - visible.length} of ${rows.length} user rows were cut after fetch`,
      );
    }

    // One extra query for the whole page rather than one per row: the roles cannot be
    // selected alongside the users without multiplying the rows, and N+1 here would be
    // N+1 on the console's busiest screen.
    const rolesByUser = await this.roles.forUsers(visible.map((row) => row.id));

    return {
      data: visible.map((row) => ({ ...row, roles: rolesByUser.get(row.id) ?? [] })),
      pagination: { skip, take, total: totals?.total ?? 0 },
    };
  }

  async findOne(id: string, ability?: AppAbility): Promise<BaseResponse<UserEntity>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // 404 rather than 403 when a condition excludes the row: the caller was told they
    // may read users, so naming this one as forbidden would confirm it exists to someone
    // whose rules were written to keep it out of view.
    if (ability && !ability.can("read", asSubject("User", user))) {
      throw new NotFoundException("User not found");
    }

    const rolesByUser = await this.roles.forUsers([id]);
    return { data: { ...user, roles: rolesByUser.get(id) ?? [] } };
  }

  async create(dto: CreateUserDto): Promise<BaseResponse<UserEntity>> {
    // Checked up front so the common case is a clean 409 rather than a database
    // error; the partial unique index below is what actually guarantees it.
    if (await this.findByEmail(dto.email)) {
      throw new ConflictException("A user with that email already exists");
    }

    // Resolved before the insert: an unknown role id should be a 400 with no account
    // created, not an account that quietly holds nothing.
    const granted = dto.roleIds
      ? await this.roles.requireRoles(dto.roleIds)
      : await this.defaultRoles();

    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            email: dto.email,
            passwordHash,
            name: dto.name ?? null,
          })
          .returning();

        if (!created) throw new ConflictException("A user with that email already exists");

        if (granted.length > 0) {
          await tx
            .insert(userRoles)
            .values(granted.map((role) => ({ userId: created.id, roleId: role.id })));
        }

        return created;
      });

      return { data: { ...user, roles: granted } };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A user with that email already exists");
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    ability: AppAbility,
  ): Promise<BaseResponse<UserEntity>> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException("User not found");
    }

    // The route guard only established that the caller may update *some* user — it had no
    // row to test conditions against. This is where "update your own account only"
    // actually takes effect; without it a conditional grant would be silently ignored,
    // which is the most dangerous kind of ignored.
    this.assertAllowed(ability, "update", existing);

    // And which columns of it. A rule narrowed to `["name"]` passes the check above —
    // CASL answers a fieldless question about the row, not about the body — so the body's
    // own keys have to be put to it separately. `password` is one of them: being allowed
    // to correct someone's display name is not being allowed to take over their account.
    assertFieldsAllowed(ability, asSubject("User", existing), touchedFields(dto));

    if (dto.email && dto.email !== existing.email) {
      const clash = await this.findByEmail(dto.email);
      if (clash) {
        throw new ConflictException("A user with that email already exists");
      }
    }

    // `password` is the only field that isn't a column — it needs hashing and a
    // different name — so it is peeled off and the rest ride along as they are.
    // Drizzle's `mapUpdateSet` drops `undefined` values before building the SQL,
    // which is what makes an absent key mean "leave this column alone".
    const { password, ...columns } = dto;
    const patch: Partial<typeof users.$inferInsert> = {
      ...columns,
      ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}),
    };

    // Tested by value, not by key count: the DTO is a class, and under
    // `target: ES2022` its declared fields exist on every instance, so a field the
    // client never sent is still an own key holding `undefined`.
    //
    // An empty PATCH is not an error, but writing it would bump `updated_at` and
    // make an audit trail claim a change that never happened — and Drizzle throws
    // "No values to set" when every value is undefined, so this is the guard for
    // that too.
    if (Object.values(patch).every((value) => value === undefined)) {
      return this.findOne(id, ability);
    }

    try {
      const [user] = await this.db
        .update(users)
        .set(patch)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning();

      if (!user) {
        // Deleted between the read and the write.
        throw new NotFoundException("User not found");
      }

      // A new password has to take effect now, not in fifteen minutes: the sessions
      // holding the old one would keep minting access tokens for it. Roles are absent
      // from this list on purpose — the token carries no authorization any more, so a
      // permission change is live on the next request without touching sessions.
      if (patch.passwordHash !== undefined) {
        await this.revokeSessions(id);
      }

      const rolesByUser = await this.roles.forUsers([id]);
      return { data: { ...user, roles: rolesByUser.get(id) ?? [] } };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A user with that email already exists");
      }
      throw error;
    }
  }

  /** The roles one user holds — what the assignment editor loads. */
  async rolesOf(id: string): Promise<BaseResponse<RoleRef[]>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const rolesByUser = await this.roles.forUsers([id]);
    return { data: rolesByUser.get(id) ?? [] };
  }

  /**
   * Replaces the set of roles a user holds.
   *
   * Takes effect immediately, with no session revocation: abilities are resolved from
   * these rows on every request that needs them, so the next call the user makes is
   * already governed by the new set. That is the payoff for keeping authorization out
   * of the access token.
   */
  async setRoles(
    id: string,
    dto: SetUserRolesDto,
    actorId: string,
    ability: AppAbility,
  ): Promise<BaseResponse<RoleRef[]>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    this.assertAllowed(ability, "update", user);

    // Roles are a field of the user for authorization purposes, even though they are
    // replaced through their own endpoint. It is the field that hands out privilege, so a
    // rule that grants `update User` for the ordinary account fields can withhold this
    // one and mean it: support may fix a typo in an email without being able to promote
    // the account to admin.
    assertFieldsAllowed(ability, asSubject("User", user), ["roles"]);

    // Editing your own roles is a one-way door: `update User` is itself a permission,
    // so the moment it lands you may no longer be able to reach this endpoint to undo
    // it. The API refuses for the same reason it refuses self-deletion.
    if (id === actorId) {
      throw new ForbiddenException("You cannot change your own roles");
    }

    const requested = new Set(dto.roleIds);
    const granted = await this.roles.requireRoles([...requested]);

    await this.assertAdminRemains(id, granted);

    await this.db.transaction(async (tx) => {
      await tx.delete(userRoles).where(eq(userRoles.userId, id));

      if (granted.length > 0) {
        await tx.insert(userRoles).values(
          granted.map((role) => ({
            userId: id,
            roleId: role.id,
            // Provenance, not authorization: who granted it is what makes the assignment
            // auditable after the fact.
            assignedById: actorId,
          })),
        );
      }
    });

    return { data: granted };
  }

  /**
   * The rules a user's roles resolve to — the effective-permissions view.
   *
   * Computed by the same service the guards use, so what the console shows is what the
   * API will actually enforce, placeholders included. A second implementation here
   * would be a second answer to the same question.
   */
  async rulesOf(id: string): Promise<BaseResponse<AppRule[]>> {
    const access = await this.abilities.forUser(id);
    if (!access) {
      throw new NotFoundException("User not found");
    }
    return { data: access.rules };
  }

  /**
   * Marks the row deleted and drops every session it owns.
   *
   * Both statements share a transaction so a user can never end up flagged as
   * deleted while still holding a refresh token that would mint new access tokens
   * for them. The access token already in the browser stays syntactically valid
   * until it expires — `AbilityGuard` re-reads the row for exactly that reason.
   */
  async softDelete(id: string, ability: AppAbility): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException("User not found");
    }

    this.assertAllowed(ability, "delete", existing);

    // Deleting the last administrator leaves an install nobody can administer, and no
    // endpoint can undo it. Checked before the write rather than repaired after.
    await this.assertAdminRemains(id, []);

    const deleted = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .update(users)
        .set({ deletedAt: new Date() })
        // `isNull` makes this idempotent-by-omission: deleting twice reports 404
        // rather than silently moving the deletion timestamp forward.
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({ id: users.id });

      if (!user) return null;

      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));

      return user;
    });

    if (!deleted) {
      throw new NotFoundException("User not found");
    }
  }

  /** Re-checks a write against the row it will touch. */
  private assertAllowed(ability: AppAbility, action: "update" | "delete", user: User): void {
    if (!ability.can(action, asSubject("User", user))) {
      throw new ForbiddenException("Insufficient permissions for this user");
    }
  }

  /** The role a new account gets when none was named. */
  private async defaultRoles(): Promise<RoleRef[]> {
    const rows = await this.db
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(roles)
      .where(eq(roles.key, DEFAULT_ROLE_KEY))
      .limit(1);

    // An install whose default role was somehow removed still creates accounts; they
    // just start with nothing, which an operator can see and fix. Refusing to create
    // users at all would be a worse failure than the one it reports.
    return rows;
  }

  /**
   * Refuses a change that would leave the install with no administrator.
   *
   * `nextRoles` is what the user would hold afterwards — an empty list for a delete.
   * The check only runs when the user is *losing* a superuser role, so the extra query
   * is paid on the one operation that could cause a lockout.
   */
  private async assertAdminRemains(userId: string, nextRoles: RoleRef[]): Promise<void> {
    const superRoleIds = await this.roles.superRoleIds();
    if (superRoleIds.length === 0) return;

    const keepsSuper = nextRoles.some((role) => superRoleIds.includes(role.id));
    if (keepsSuper) return;

    const [held] = await this.db
      .select({ total: count() })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, superRoleIds)))
      .limit(1);

    // Not an administrator to begin with, so this change cannot remove the last one.
    if (!held || held.total === 0) return;

    const [others] = await this.db
      .select({ total: count() })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(
        and(
          inArray(userRoles.roleId, superRoleIds),
          ne(userRoles.userId, userId),
          isNull(users.deletedAt),
        ),
      );

    if (!others || others.total === 0) {
      throw new ConflictException(
        `This is the last account with the "${SUPER_ROLE_KEY}" role — grant it to someone else first`,
      );
    }
  }

  private async revokeSessions(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}
