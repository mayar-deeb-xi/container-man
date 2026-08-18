import "reflect-metadata";

import type { NestExpressApplication } from "@nestjs/platform-express";
import { ClassSerializerInterceptor, Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
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

  // Without this the @Exclude/@Expose decorators on the entity classes are inert
  // metadata — this interceptor is the only thing that runs them, so registering
  // it is what turns those allowlists from documentation into enforcement.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Trust the proxy so req.ip records the client address rather than the LB's.
  app.set("trust proxy", 1);

  // Without this Nest ignores SIGTERM, so a container stop would kill the process
  // with the connection pool still open instead of letting DbModule drain it.
  app.enableShutdownHooks();

  await app.listen(config.port);
  new Logger("Bootstrap").log(`Backend listening on http://localhost:${config.port}`);
}

void bootstrap();
