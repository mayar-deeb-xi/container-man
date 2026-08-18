import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";

import type { BaseResponse } from "../../lib/base.dto";
import { RequireAbility } from "../../decorators/require-ability.decorator";
import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { BaseResponseDTO } from "../../lib/base.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { ListRolesDto } from "./dto/list-roles.dto";
import { SetRolePermissionsDto } from "./dto/set-role-permissions.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RoleDetailEntity, RoleEntity } from "./entities/role.entity";
import { RolesService } from "./roles.service";

/** Hoisted so the routes share one generated envelope class each. */
const RoleResponse = BaseResponseDTO(RoleEntity);
const RoleDetailResponse = BaseResponseDTO(RoleDetailEntity);

/**
 * Role administration.
 *
 * Guard order matters: `JwtAccessGuard` attaches the token payload that
 * `AbilityGuard` then resolves into an ability. The controller declares
 * `read Role` so a route added later inherits at least that — the safe direction to
 * forget — and the write routes narrow it further.
 *
 * The envelope is declared per route rather than on the class because the list and
 * the detail serialize against different allowlists; without the right one a route
 * would ship whatever the service selected.
 */
@Controller("roles")
@UseGuards(JwtAccessGuard, AbilityGuard)
@RequireAbility({ action: "read", subject: "Role" })
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @SerializeOptions({ type: RoleResponse })
  async list(@Query() query: ListRolesDto): Promise<BaseResponse<RoleEntity[]>> {
    return this.roles.list(query);
  }

  @Get(":id")
  @SerializeOptions({ type: RoleDetailResponse })
  async findOne(@Param("id", ParseUUIDPipe) id: string): Promise<BaseResponse<RoleDetailEntity>> {
    return this.roles.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAbility({ action: "create", subject: "Role" })
  @SerializeOptions({ type: RoleDetailResponse })
  async create(@Body() dto: CreateRoleDto): Promise<BaseResponse<RoleDetailEntity>> {
    return this.roles.create(dto);
  }

  @Patch(":id")
  @RequireAbility({ action: "update", subject: "Role" })
  @SerializeOptions({ type: RoleDetailResponse })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<BaseResponse<RoleDetailEntity>> {
    return this.roles.update(id, dto);
  }

  /**
   * The matrix editor's save. `PUT` because the body is the complete rule set — the
   * resource is replaced, not amended — which is also why an empty `rules` array is a
   * valid way to revoke everything.
   */
  @Put(":id/permissions")
  @RequireAbility({ action: "update", subject: "Role" })
  @SerializeOptions({ type: RoleDetailResponse })
  async setPermissions(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
  ): Promise<BaseResponse<RoleDetailEntity>> {
    return this.roles.setPermissions(id, dto);
  }

  /**
   * Hard delete — a role is not referenced by anything that needs its name preserved
   * after the fact. Refused while anyone still holds it, so the cascade can never
   * quietly strip permissions from a user nobody was looking at.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAbility({ action: "delete", subject: "Role" })
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.roles.remove(id);
  }
}
