import "reflect-metadata";

import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { AppConfigService } from "./config/app-config.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfigService);

  app.use(cookieParser());

  // `credentials: true` is what allows the browser to send and store the httpOnly
  // auth cookies on cross-origin requests from the admin app.
  app.enableCors({
    origin: config.webOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Trust the proxy so req.ip records the client address rather than the LB's.
  app.set("trust proxy", 1);

  await app.listen(config.port);
  new Logger("Bootstrap").log(`Backend listening on http://localhost:${config.port}`);
}

void bootstrap();
