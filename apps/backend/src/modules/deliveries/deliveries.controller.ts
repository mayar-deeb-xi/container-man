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
import type { AccessTokenPayload } from "@repo/auth";

import type { BaseResponse } from "../../lib/base.dto";
import { CurrentAbility } from "../../decorators/current-ability.decorator";
import { CurrentUser } from "../../decorators/current-user.decorator";
import { RequireAbility } from "../../decorators/require-ability.decorator";
import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { BaseResponseDTO } from "../../lib/base.dto";
import { DeliveriesService } from "./deliveries.service";
import { CreateDeliveryDto } from "./dto/create-delivery.dto";
import { CreatePalletDto } from "./dto/create-pallet.dto";
import { ListDeliveriesDto, ListTrashedDeliveriesDto } from "./dto/list-deliveries.dto";
import { UpdateDeliveryDto } from "./dto/update-delivery.dto";
import { UpdatePalletDto } from "./dto/update-pallet.dto";
import {
  DeliveryDetailEntity,
  DeliveryEntity,
  DeliverySupplierEntity,
  TrashedDeliveryEntity,
} from "./entities/delivery.entity";
import { PalletEntity } from "./entities/pallet.entity";

const DeliveryResponse = BaseResponseDTO(DeliveryEntity);
const DeliveryDetailResponse = BaseResponseDTO(DeliveryDetailEntity);
const TrashedDeliveryResponse = BaseResponseDTO(TrashedDeliveryEntity);
const PalletResponse = BaseResponseDTO(PalletEntity);
const SupplierOptionResponse = BaseResponseDTO(DeliverySupplierEntity);

/**
 * The goods-in register.
 *
 * Pallets are routed under their delivery rather than as a top-level resource because
 * that is what they are: lines of one record, sharing its lifecycle and its grants. All
 * pallet writes sit behind `update Delivery` — including removal, since striking a line
 * from a draft is editing the draft; `delete Delivery` governs trashing the record.
 */
@Controller("deliveries")
@UseGuards(JwtAccessGuard, AbilityGuard)
@RequireAbility({ action: "read", subject: "Delivery" })
@SerializeOptions({ type: DeliveryResponse })
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  async list(
    @Query() query: ListDeliveriesDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<DeliveryEntity[]>> {
    return this.deliveries.list(query, ability);
  }

  /** Before `:id`, since `trash` is not a uuid. Deleted *drafts* only — signed rows never land here. */
  @Get("trash")
  @RequireAbility({ action: "delete", subject: "Delivery" })
  @SerializeOptions({ type: TrashedDeliveryResponse })
  async listTrash(
    @Query() query: ListTrashedDeliveriesDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<TrashedDeliveryEntity[]>> {
    return this.deliveries.listTrash(query, ability);
  }

  /**
   * The supplier picker and filter options: id and code only, under the class-level
   * `read Delivery` rather than `read Supplier` — codes already appear on every
   * register row, and requiring the grant that reveals supplier *names* just to pick
   * or filter by code would defeat the code system. Declared before `:id`, like `trash`.
   */
  @Get("supplier-options")
  @SerializeOptions({ type: SupplierOptionResponse })
  async supplierOptions(): Promise<BaseResponse<DeliverySupplierEntity[]>> {
    return this.deliveries.supplierOptions();
  }

  @Get(":id")
  @SerializeOptions({ type: DeliveryDetailResponse })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<DeliveryDetailEntity>> {
    return this.deliveries.findOne(id, ability);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAbility({ action: "create", subject: "Delivery" })
  async create(@Body() dto: CreateDeliveryDto): Promise<BaseResponse<DeliveryEntity>> {
    return this.deliveries.create(dto);
  }

  @Patch(":id")
  @RequireAbility({ action: "update", subject: "Delivery" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<DeliveryEntity>> {
    return this.deliveries.update(id, dto, ability);
  }

  /**
   * The sign-off. The signer is the authenticated caller — never a body field, because
   * a signature someone else can type is not a signature. Refuses an empty or
   * incompletely classified record; answers the fully signed detail.
   */
  @Post(":id/sign")
  @HttpCode(HttpStatus.OK)
  @RequireAbility({ action: "update", subject: "Delivery" })
  @SerializeOptions({ type: DeliveryDetailResponse })
  async sign(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<DeliveryDetailEntity>> {
    return this.deliveries.sign(id, ability, user.sub);
  }

  /** Soft delete — drafts only; a signed record refuses with 409. */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAbility({ action: "delete", subject: "Delivery" })
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<void> {
    await this.deliveries.softDelete(id, ability);
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  @RequireAbility({ action: "delete", subject: "Delivery" })
  async restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<DeliveryEntity>> {
    return this.deliveries.restore(id, ability);
  }

  /** A new line on the draft. The caller is the default worker — the scale station's account. */
  @Post(":id/pallets")
  @HttpCode(HttpStatus.CREATED)
  @RequireAbility({ action: "update", subject: "Delivery" })
  @SerializeOptions({ type: PalletResponse })
  async addPallet(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreatePalletDto,
    @CurrentUser() user: AccessTokenPayload,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<PalletEntity>> {
    return this.deliveries.addPallet(id, dto, ability, user.sub);
  }

  @Patch(":id/pallets/:palletId")
  @RequireAbility({ action: "update", subject: "Delivery" })
  @SerializeOptions({ type: PalletResponse })
  async updatePallet(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("palletId", ParseUUIDPipe) palletId: string,
    @Body() dto: UpdatePalletDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<PalletEntity>> {
    return this.deliveries.updatePallet(id, palletId, dto, ability);
  }

  @Delete(":id/pallets/:palletId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAbility({ action: "update", subject: "Delivery" })
  async removePallet(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("palletId", ParseUUIDPipe) palletId: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<void> {
    await this.deliveries.removePallet(id, palletId, ability);
  }
}
