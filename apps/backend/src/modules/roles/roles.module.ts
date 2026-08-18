import { Module } from "@nestjs/common";

import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

/**
 * Exports `RolesService` because the users module needs it: assigning a role means
 * resolving ids to rows, and listing users means fetching the roles each one holds.
 * The dependency runs one way — roles know nothing about users — so there is no cycle
 * to work around.
 */
@Module({
  controllers: [RolesController],
  providers: [RolesService, JwtAccessGuard, AbilityGuard],
  exports: [RolesService],
})
export class RolesModule {}
