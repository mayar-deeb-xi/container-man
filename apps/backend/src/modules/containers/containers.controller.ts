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
  Query,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";

import type { AppAbility } from "@repo/access";

import type { BaseResponse } from "../../lib/base.dto";
import { CurrentAbility } from "../../decorators/current-ability.decorator";
import { RequireAbility } from "../../decorators/require-ability.decorator";
import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { BaseResponseDTO } from "../../lib/base.dto";
import { ContainersService } from "./containers.service";
import { CreateContainerDto } from "./dto/create-container.dto";
import { ListContainersDto } from "./dto/list-containers.dto";
import { UpdateContainerDto } from "./dto/update-container.dto";
import { ContainerEntity } from "./entities/container.entity";

/** Hoisted so every route below shares one generated envelope class. */
const ContainerResponse = BaseResponseDTO(ContainerEntity);

/**
 * The container fleet.
 *
 * Guard order matters: `JwtAccessGuard` attaches the token payload that `AbilityGuard`
 * resolves into a CASL ability. `read Container` is declared on the controller so a route
 * added later is gated by default, and each write narrows it to the action it performs.
 *
 * Every route that touches a row is handed the ability as well, because a route-level check
 * cannot see a record: a rule granting `update Container` only where `assignedToId` is the
 * caller passes the guard, and the service is where it actually takes effect.
 */
@Controller("containers")
@UseGuards(JwtAccessGuard, AbilityGuard)
@RequireAbility({ action: "read", subject: "Container" })
@SerializeOptions({ type: ContainerResponse })
export class ContainersController {
  constructor(private readonly containers: ContainersService) {}

  @Get()
  async list(
    @Query() query: ListContainersDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<ContainerEntity[]>> {
    return this.containers.list(query, ability);
  }

  @Get(":id")
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<ContainerEntity>> {
    return this.containers.findOne(id, ability);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAbility({ action: "create", subject: "Container" })
  async create(@Body() dto: CreateContainerDto): Promise<BaseResponse<ContainerEntity>> {
    return this.containers.create(dto);
  }

  @Patch(":id")
  @RequireAbility({ action: "update", subject: "Container" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateContainerDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<ContainerEntity>> {
    return this.containers.update(id, dto, ability);
  }

  /**
   * Soft delete — the row stays and `deleted_at` is stamped. 204 because there is nothing
   * meaningful to return.
   *
   * Note this is not how a scrapped box is recorded: that is `status: "retired"`, which
   * keeps it in the fleet list where its history still resolves.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAbility({ action: "delete", subject: "Container" })
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<void> {
    await this.containers.softDelete(id, ability);
  }
}
