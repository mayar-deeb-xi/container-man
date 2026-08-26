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
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { ListSuppliersDto, ListTrashedSuppliersDto } from "./dto/list-suppliers.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { SupplierEntity, TrashedSupplierEntity } from "./entities/supplier.entity";
import { SuppliersService } from "./suppliers.service";

const SupplierResponse = BaseResponseDTO(SupplierEntity);
const TrashedSupplierResponse = BaseResponseDTO(TrashedSupplierEntity);

/**
 * The supplier register.
 *
 * Deliberately a separate gate from goods-in: `read Supplier` is what reveals supplier
 * *names*, while the deliveries API embeds only codes. A goods-in clerk needs no grant
 * here at all — the delivery form's supplier picker is the one thing that does.
 */
@Controller("suppliers")
@UseGuards(JwtAccessGuard, AbilityGuard)
@RequireAbility({ action: "read", subject: "Supplier" })
@SerializeOptions({ type: SupplierResponse })
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  async list(
    @Query() query: ListSuppliersDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<SupplierEntity[]>> {
    return this.suppliers.list(query, ability);
  }

  /** Before `:id`, since `trash` is not a uuid. Same grant pairing as the containers trash. */
  @Get("trash")
  @RequireAbility({ action: "delete", subject: "Supplier" })
  @SerializeOptions({ type: TrashedSupplierResponse })
  async listTrash(
    @Query() query: ListTrashedSuppliersDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<TrashedSupplierEntity[]>> {
    return this.suppliers.listTrash(query, ability);
  }

  @Get(":id")
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<SupplierEntity>> {
    return this.suppliers.findOne(id, ability);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAbility({ action: "create", subject: "Supplier" })
  async create(@Body() dto: CreateSupplierDto): Promise<BaseResponse<SupplierEntity>> {
    return this.suppliers.create(dto);
  }

  @Patch(":id")
  @RequireAbility({ action: "update", subject: "Supplier" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<SupplierEntity>> {
    return this.suppliers.update(id, dto, ability);
  }

  /**
   * Soft delete — and a 409 when the supplier has recorded deliveries: those records
   * must keep resolving who delivered, so the row they point at cannot go away.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAbility({ action: "delete", subject: "Supplier" })
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<void> {
    await this.suppliers.softDelete(id, ability);
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  @RequireAbility({ action: "delete", subject: "Supplier" })
  async restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentAbility() ability: AppAbility,
  ): Promise<BaseResponse<SupplierEntity>> {
    return this.suppliers.restore(id, ability);
  }
}
