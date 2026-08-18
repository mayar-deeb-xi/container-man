import { Inject, Injectable } from "@nestjs/common";
import { asc } from "drizzle-orm";

import { permissions } from "@repo/db";

import type { BaseResponse } from "../../lib/base.dto";
import type { Database } from "../../lib/db/db.module";
import type { PermissionEntity } from "./entities/permission.entity";
import { DRIZZLE } from "../../lib/db/db.module";

@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * The whole catalog, unpaginated.
   *
   * There are as many rows as there are (action, subject) pairs in `@repo/access` —
   * sixteen today, and it grows by a handful when a subject is added. Paging a list
   * whose entire purpose is to be rendered as one matrix would only make the client
   * reassemble it.
   *
   * Ordered by subject then action so the matrix comes out of the API in the order
   * it is drawn, rather than each client sorting it and one of them differently.
   */
  async list(): Promise<BaseResponse<PermissionEntity[]>> {
    const rows = await this.db
      .select()
      .from(permissions)
      .orderBy(asc(permissions.subject), asc(permissions.action));

    return { data: rows };
  }
}
