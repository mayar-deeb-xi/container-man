import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, ValidateNested } from "class-validator";

import { MAX_RULES_PER_ROLE } from "./create-role.dto";
import { RuleDto } from "./rule.dto";

/**
 * The complete rule set for a role — a replace, not a merge.
 *
 * The matrix editor knows every cell's state, so sending the whole set is both the
 * natural payload and the one that cannot drift: a merge would need a separate
 * "revoke" call, and a cell unchecked in the browser would stay granted if that call
 * were lost.
 */
export class SetRolePermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleDto)
  @ArrayMaxSize(MAX_RULES_PER_ROLE)
  rules!: RuleDto[];
}
