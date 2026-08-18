import { Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAccessGuard } from "./guards/jwt-access.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessGuard, JwtRefreshGuard],
  exports: [AuthService],
})
export class AuthModule {}
