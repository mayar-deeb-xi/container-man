import { Global, Module } from "@nestjs/common";

import { RedisService } from "./redis.service";

/**
 * Global for the same reason as DbModule: the cache is infrastructure that any
 * feature module may reach for, and a non-global module would have to be imported by
 * each one. Importing it is always safe — with no REDIS_URL the service simply
 * reports the cache as disabled.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
