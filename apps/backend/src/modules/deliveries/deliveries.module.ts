import { Module } from "@nestjs/common";

import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { DeliveriesController } from "./deliveries.controller";
import { DeliveriesService } from "./deliveries.service";
import { DeliveryFilesController } from "./delivery-files.controller";
import { DeliveryFilesService } from "./delivery-files.service";

/** Guards as providers for the same reason every other module lists them. */
@Module({
  controllers: [DeliveriesController, DeliveryFilesController],
  providers: [DeliveriesService, DeliveryFilesService, JwtAccessGuard, AbilityGuard],
  exports: [DeliveriesService, DeliveryFilesService],
})
export class DeliveriesModule {}
