import { Module } from "@nestjs/common";

import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { ContainersController } from "./containers.controller";
import { ContainersService } from "./containers.service";

/**
 * The guards are listed as providers here for the same reason the other modules list them:
 * Nest resolves an enhancer against the injector of the module whose controller declares
 * it. They hold no state, so a second instance costs nothing. `AbilityService` comes from
 * the global `AbilityModule`.
 */
@Module({
  controllers: [ContainersController],
  providers: [ContainersService, JwtAccessGuard, AbilityGuard],
  exports: [ContainersService],
})
export class ContainersModule {}
