import { Module } from "@nestjs/common";

import { AbilityGuard } from "../../guards/ability.guard";
import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { RolesModule } from "../roles/roles.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * The shared guards are listed here rather than owned by one module: Nest
 * resolves an enhancer class against the injector of the module whose controller
 * declares it. They hold no state, so the instance each module builds of its own
 * costs nothing. `AbilityService` comes from the global `AbilityModule`, which is
 * what keeps that from having to be repeated everywhere too.
 *
 * `RolesModule` is imported because assigning and reading roles both go through
 * `RolesService`. The dependency runs one way, so there is no cycle.
 */
@Module({
  imports: [RolesModule],
  controllers: [UsersController],
  providers: [UsersService, JwtAccessGuard, AbilityGuard],
  exports: [UsersService],
})
export class UsersModule {}
