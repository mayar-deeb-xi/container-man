import { Module } from "@nestjs/common";

import { JwtAccessGuard } from "../../guards/jwt-access.guard";
import { RolesGuard } from "../../guards/roles.guard";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * The shared guards are listed here rather than owned by one module: Nest
 * resolves an enhancer class against the injector of the module whose controller
 * declares it, and `RolesGuard`'s dependency on `UsersService` only resolves in
 * this one. They hold no state, so the instance AuthModule builds of its own
 * costs nothing.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService, JwtAccessGuard, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
