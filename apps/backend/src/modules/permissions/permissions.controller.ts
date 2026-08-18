import { Controller, Get, SerializeOptions, UseGuards } from "@nestjs/common";

import type { BaseResponse } from "../../lib/base.dto";
import { RequireAbility } from "../../decorators/require-ability.decorator";
import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { BaseResponseDTO } from "../../lib/base.dto";
import { PermissionEntity } from "./entities/permission.entity";
import { PermissionsService } from "./permissions.service";

const PermissionResponse = BaseResponseDTO(PermissionEntity);

/**
 * The grantable-permission catalog. Read-only over HTTP on purpose: the rows are a
 * projection of `PERMISSION_CATALOG` in `@repo/access`, upserted by the seed, so a
 * POST here would invent a permission that no guard checks and no code can grant.
 *
 * Gated on `read Role` rather than a subject of its own. The catalog is only
 * meaningful to someone editing a role's permissions, and giving it a separate
 * permission would mean a role could be granted the editor without the vocabulary
 * it edits — a matrix with no columns.
 */
@Controller("permissions")
@UseGuards(JwtAccessGuard, AbilityGuard)
@RequireAbility({ action: "read", subject: "Role" })
@SerializeOptions({ type: PermissionResponse })
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  async list(): Promise<BaseResponse<PermissionEntity[]>> {
    return this.permissions.list();
  }
}
