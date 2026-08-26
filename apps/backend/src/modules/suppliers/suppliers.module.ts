import { Module } from "@nestjs/common";

import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";

/** Guards as providers for the same reason every other module lists them. */
@Module({
  controllers: [SuppliersController],
  providers: [SuppliersService, JwtAccessGuard, AbilityGuard],
  exports: [SuppliersService],
})
export class SuppliersModule {}
