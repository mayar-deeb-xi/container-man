import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "./auth/auth.module";
import { AppConfigService } from "./config/app-config.service";
import { findRootEnvFile, validate } from "./config/env";
import { DbModule } from "./lib/db/db.module";
import { HealthController } from "./health.controller";
import { UsersModule } from "./users/users.module";

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
    UsersModule,
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppModule {}
