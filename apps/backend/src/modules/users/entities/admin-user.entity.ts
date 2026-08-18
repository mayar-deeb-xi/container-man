import { Exclude, Expose } from "class-transformer";

import { UserEntity } from "../../auth/entities/user.entity";

/**
 * What the user-management endpoints return: the identity shape plus the
 * timestamps an operator needs to make sense of a list of accounts.
 *
 * It extends the auth module's entity rather than restating it, which is also
 * what keeps the two apart: `/auth/me` answers about the caller and must not
 * quietly start shipping row metadata just because this view wanted it.
 *
 * `deletedAt` is deliberately absent — these endpoints only ever return live
 * rows, so a field that is always null would just invite a client to branch on it.
 */
@Exclude()
export class AdminUserEntity extends UserEntity {
  @Expose() createdAt: Date;
  @Expose() updatedAt: Date;
}
