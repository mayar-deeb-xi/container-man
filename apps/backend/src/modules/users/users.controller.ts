import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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

import type { AppAbility, AppRule } from "@repo/access";
import type { AccessTokenPayload } from "@repo/auth";

import type { BaseResponse } from "../../lib/base.dto";
import type { RoleRef } from "../roles/roles.service";
import { CurrentAbility } from "../../decorators/current-ability.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { RequireAbility } from "../../decorators/require-ability.decorator";
import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { BaseResponseDTO } from "../../lib/base.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { SetUserRolesDto } from "./dto/set-user-roles.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { EffectiveRuleEntity, UserEntity, UserRoleEntity } from "./entities/user.entity";
import { UsersService } from "./users.service";

/** Hoisted so every route below shares one generated envelope class. */
const UserResponse = BaseResponseDTO(UserEntity);
const UserRolesResponse = BaseResponseDTO(UserRoleEntity);
const UserRulesResponse = BaseResponseDTO(EffectiveRuleEntity);

/**
 * User administration. Guard order matters: `JwtAccessGuard` attaches the token
 * payload that `AbilityGuard` then resolves into a CASL ability.
 *
 * `read User` is declared on the controller rather than per route, so a route added
 * later is gated by default — the safe direction to forget — and each write narrows
 * it to the action it performs. A role granted only `read User` therefore gets a
 * working, read-only console rather than a table that 403s on every request.
 */
@Controller("users")
@UseGuards(JwtAccessGuard, AbilityGuard)
@RequireAbility({ action: "read", subject: "User" })
@SerializeOptions({ type: UserResponse })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * The ability is threaded into the service on every route that touches a row.
   *
   * `@RequireAbility` on its own can only ask "may this caller update users at all" —
   * there is no record at guard time to match a rule's conditions against. So a rule like
   * "update User where id is your own" would pass the guard and then be ignored, which is
   * the failure mode that looks like it works. Passing the ability down is what lets the
   * service decide against the row it loaded.
   */
  @Get()
  async list(
    @Query() query: ListUsersDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<UserEntity[]>> {
    return this.users.list(query, ability);
  }

  @Get(":id")
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<UserEntity>> {
    return this.users.findOne(id, ability);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAbility({ action: "create", subject: "User" })
  async create(@Body() dto: CreateUserDto): Promise<BaseResponse<UserEntity>> {
    return this.users.create(dto);
  }

  @Patch(":id")
  @RequireAbility({ action: "update", subject: "User" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<UserEntity>> {
    return this.users.update(id, dto, ability);
  }

  /**
   * The roles one user holds. Gated on `read Role` as well as the controller's
   * `read User`: this answers a question about roles, and someone who may see the
   * account list is not automatically entitled to the privilege map.
   */
  @Get(":id/roles")
  @RequireAbility({ action: "read", subject: "Role" })
  @SerializeOptions({ type: UserRolesResponse })
  async rolesOf(@Param("id", ParseUUIDPipe) id: string): Promise<BaseResponse<RoleRef[]>> {
    return this.users.rolesOf(id);
  }

  /**
   * Replaces a user's roles — `PUT` because the body is the complete set.
   *
   * Requires `update User` *and* `update Role`: granting roles is how privilege is
   * handed out, so it takes the permission to administer accounts and the permission
   * to administer what a role means. Without the second, an operator who may only
   * edit names could promote themselves by assigning `admin` to a colleague.
   */
  @Put(":id/roles")
  @RequireAbility({ action: "update", subject: "User" }, { action: "update", subject: "Role" })
  @SerializeOptions({ type: UserRolesResponse })
  async setRoles(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() actor: AccessTokenPayload,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<RoleRef[]>> {
    return this.users.setRoles(id, dto, actor.sub, ability);
  }

  /**
   * The rules a user's roles add up to, resolved exactly as the guards resolve them —
   * so what the console displays as "effective permissions" is what the API enforces.
   */
  @Get(":id/rules")
  @RequireAbility({ action: "read", subject: "Role" })
  @SerializeOptions({ type: UserRulesResponse })
  async rulesOf(@Param("id", ParseUUIDPipe) id: string): Promise<BaseResponse<AppRule[]>> {
    return this.users.rulesOf(id);
  }

  /**
   * Soft delete — the row stays, `deleted_at` is stamped, and every session the
   * user holds is revoked. 204 because there is nothing meaningful to return.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAbility({ action: "delete", subject: "User" })
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
    @CurrentAbility() ability: AppAbility,
  ): Promise<void> {
    if (id === actor.sub) {
      throw new ForbiddenException("You cannot delete your own account");
    }
    await this.users.softDelete(id, ability);
  }
}
