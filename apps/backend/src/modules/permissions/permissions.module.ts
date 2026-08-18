import { Module } from "@nestjs/common";

import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";

/**
 * The guards are listed as providers here for the same reason `UsersModule` lists
 * them: Nest resolves an enhancer against the injector of the module whose
 * controller declares it. They hold no state, so a second instance costs nothing.
 */
@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService, JwtAccessGuard, AbilityGuard],
  exports: [PermissionsService],
})
export class PermissionsModule {}
