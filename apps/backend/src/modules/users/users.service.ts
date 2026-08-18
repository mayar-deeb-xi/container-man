import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";

import type { User } from "@repo/db";
import { hashPassword } from "@repo/auth/password";
import { sessions, users } from "@repo/db";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { ListUsersDto } from "./dto/list-users.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";
import { DRIZZLE } from "../../lib/db/db.module";
import { UserEntity } from "./entities/user.entity";

/**
 * Escapes the wildcards Postgres' LIKE grammar reserves.
 *
 * Without this a search for `_` or `%` matches every row rather than the rows
 * containing that character — surprising, and a cheap way to make the query scan
 * the whole table.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Postgres' unique_violation. Reached only when a concurrent insert wins the race. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "23505"
  );
}

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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

  async list(query: ListUsersDto): Promise<BaseResponse<UserEntity[]>> {
    const { skip, take, search, role } = query;

    const term = search ? `%${escapeLike(search)}%` : undefined;
    const where = and(
      isNull(users.deletedAt),
      role ? eq(users.role, role) : undefined,
      term ? or(ilike(users.email, term), ilike(users.name, term)) : undefined,
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

    return { data: rows, pagination: { skip, take, total: totals?.total ?? 0 } };
  }

  async findOne(id: string): Promise<BaseResponse<UserEntity>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return { data: user };
  }

  async create(dto: CreateUserDto): Promise<BaseResponse<UserEntity>> {
    // Checked up front so the common case is a clean 409 rather than a database
    // error; the partial unique index below is what actually guarantees it.
    if (await this.findByEmail(dto.email)) {
      throw new ConflictException("A user with that email already exists");
    }

    const passwordHash = await hashPassword(dto.password);

    try {
      const [user] = await this.db
        .insert(users)
        .values({
          email: dto.email,
          passwordHash,
          name: dto.name ?? null,
          role: dto.role ?? "user",
        })
        .returning();

      return { data: user! };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A user with that email already exists");
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateUserDto): Promise<BaseResponse<UserEntity>> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new NotFoundException("User not found");
    }

    if (dto.email && dto.email !== existing.email) {
      const clash = await this.findByEmail(dto.email);
      if (clash) {
        throw new ConflictException("A user with that email already exists");
      }
    }

    const patch: Partial<typeof users.$inferInsert> = {};
    if (dto.email !== undefined) patch.email = dto.email;
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.password !== undefined) patch.passwordHash = await hashPassword(dto.password);

    // An empty PATCH is not an error, but writing it would bump `updated_at` and
    // make an audit trail claim a change that never happened.
    if (Object.keys(patch).length === 0) {
      return { data: existing };
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

      // A new password or a lost privilege has to take effect now, not in fifteen
      // minutes: the access token carries `role`, and its bearer keeps whatever it
      // was minted with until it expires. Revoking the sessions forces a fresh
      // login, which is the only way to reissue those claims.
      if (patch.passwordHash !== undefined || (patch.role && patch.role !== existing.role)) {
        await this.revokeSessions(id);
      }

      return { data: user };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("A user with that email already exists");
      }
      throw error;
    }
  }

  /**
   * Marks the row deleted and drops every session it owns.
   *
   * Both statements share a transaction so a user can never end up flagged as
   * deleted while still holding a refresh token that would mint new access tokens
   * for them. The access token already in the browser stays syntactically valid
   * until it expires — `RolesGuard` re-reads the row for exactly that reason.
   */
  async softDelete(id: string): Promise<void> {
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

  private async revokeSessions(userId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}
