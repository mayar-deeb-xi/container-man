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
import { ListTrashedContainersDto } from "./dto/list-trashed-containers.dto";
import { UpdateContainerDto } from "./dto/update-container.dto";
import { ContainerEntity, TrashedContainerEntity } from "./entities/container.entity";

/** Hoisted so every route below shares one generated envelope class. */
const ContainerResponse = BaseResponseDTO(ContainerEntity);
const TrashedContainerResponse = BaseResponseDTO(TrashedContainerEntity);

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

  /**
   * The trash. Declared before `:id` — Nest matches routes in declaration order, and
   * `trash` is not a uuid.
   *
   * `delete Container` rather than `read`: the trash and restore are two halves of undoing
   * a mistaken delete, so one grant covers seeing the bin and emptying it back out.
   */
  @Get("trash")
  @RequireAbility({ action: "delete", subject: "Container" })
  @SerializeOptions({ type: TrashedContainerResponse })
  async listTrash(
    @Query() query: ListTrashedContainersDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<TrashedContainerEntity[]>> {
    return this.containers.listTrash(query, ability);
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

  /**
   * Restore from the trash — delete's inverse, behind the same grant.
   *
   * Answers 409 when the number was re-entered while the row sat in the trash: the unique
   * index is partial, so deleting freed it. Returns the restored container so the client
   * lands with the row rather than refetching to learn what it just brought back.
   */
  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  @RequireAbility({ action: "delete", subject: "Container" })
  async restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<ContainerEntity>> {
    return this.containers.restore(id, ability);
  }
}
