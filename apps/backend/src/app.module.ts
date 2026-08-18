import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AppConfigService } from "./config/app-config.service";
import { findRootEnvFile, validate } from "./config/env";
import { HealthController } from "./health.controller";
import { AbilityModule } from "./lib/ability/ability.module";
import { DbModule } from "./lib/db/db.module";
import { RedisModule } from "./lib/redis/redis.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ContainersModule } from "./modules/containers/containers.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { RolesModule } from "./modules/roles/roles.module";
import { UsersModule } from "./modules/users/users.module";

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `validate` runs before the container is built, so a bad env aborts boot.
      validate,
      envFilePath: findRootEnvFile(),
      cache: true,
    }),
    DbModule,
    RedisModule,
    AbilityModule,
    UsersModule,
    RolesModule,
    ContainersModule,
    PermissionsModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppModule {}
