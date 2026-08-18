import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import type { PublicUser } from "@repo/auth";
import type { User } from "@repo/db";
import { users } from "@repo/db";

import type { Database } from "../lib/db/db.module";
import { DRIZZLE } from "../lib/db/db.module";

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);
    return user;
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  /** Strips the password hash — the only shape that may cross the wire. */
  static toPublic(user: User): PublicUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }
}
