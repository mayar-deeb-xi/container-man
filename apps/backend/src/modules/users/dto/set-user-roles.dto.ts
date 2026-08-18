import { ArrayMaxSize, IsArray, IsUUID } from "class-validator";

/** No install has a use for more than this, and it bounds the resolve query. */
export const MAX_ROLES_PER_USER = 20;

/**
 * The complete set of roles a user should hold — a replace, not an add.
 *
 * Same reasoning as a role's permissions: the console knows every checkbox's state,
 * so sending the whole set is both the natural payload and the one that cannot drift.
 * An empty array is a valid way to strip every role, which leaves an account that can
 * sign in and do nothing — deliberately expressible, since the alternative is
 * deleting someone to suspend them.
 */
export class SetUserRolesDto {
  @IsArray()
  @IsUUID("4", { each: true })
  @ArrayMaxSize(MAX_ROLES_PER_USER)
  roleIds!: string[];
}
