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
  Query,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";

import type { AccessTokenPayload } from "@repo/auth";

import type { BaseResponse } from "../../lib/base.dto";
import type { AdminUser } from "./users.service";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { Roles } from "../../decorators/roles.decorator";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { RolesGuard } from "../../guards/roles.guard";
import { BaseResponseDTO } from "../../lib/base.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { AdminUserEntity } from "./entities/admin-user.entity";
import { UsersService } from "./users.service";

/** Hoisted so every route below shares one generated envelope class. */
const AdminUserResponse = BaseResponseDTO(AdminUserEntity);

/**
 * User administration. Guard order matters: `JwtAccessGuard` attaches the token
 * payload that `RolesGuard` then resolves to a live row.
 *
 * Both are declared on the controller rather than per route, so a route added
 * later is admin-only by default — the safe direction to forget.
 */
@Controller("users")
@UseGuards(JwtAccessGuard, RolesGuard)
@Roles("admin")
@SerializeOptions({ type: AdminUserResponse })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@Query() query: ListUsersDto): Promise<BaseResponse<AdminUser[]>> {
    return this.users.list(query);
  }

  @Get(":id")
  async findOne(@Param("id", ParseUUIDPipe) id: string): Promise<BaseResponse<AdminUser>> {
    return this.users.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto): Promise<BaseResponse<AdminUser>> {
    return this.users.create(dto);
  }

  @Patch(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AccessTokenPayload,
  ): Promise<BaseResponse<AdminUser>> {
    // Demoting yourself is a one-way door: the moment it lands you can no longer
    // reach this endpoint to undo it, and if you were the last admin nobody can.
    if (id === actor.sub && dto.role && dto.role !== "admin") {
      throw new ForbiddenException("You cannot change your own role");
    }
    return this.users.update(id, dto);
  }

  /**
   * Soft delete — the row stays, `deleted_at` is stamped, and every session the
   * user holds is revoked. 204 because there is nothing meaningful to return.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AccessTokenPayload,
  ): Promise<void> {
    if (id === actor.sub) {
      throw new ForbiddenException("You cannot delete your own account");
    }
    await this.users.softDelete(id);
  }
}
