import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";

import type { RedisClientType } from "@repo/cache";
import { cacheKey, closeRedis, connectRedis, isCacheEnabled, redis } from "@repo/cache";

/**
 * The single seam between the app and Redis.
 *
 * Redis is optional, so every method here is best-effort: with no REDIS_URL, or with
 * a Redis that is down mid-request, reads report a miss and writes are dropped. That
 * is the whole point of routing through a service instead of using the client
 * directly — a cache outage must never turn a working request into a 500.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** `undefined` when Redis is not configured. Prefer the helpers below. */
  readonly client: RedisClientType | undefined = redis;

  /** True only once the connection has actually been established. */
  private connected = false;

  get enabled(): boolean {
    return isCacheEnabled;
  }

  get available(): boolean {
    return this.connected && this.client?.isReady === true;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log("REDIS_URL is not set — running without a cache");
      return;
    }

    this.connected = await connectRedis();
    if (this.connected) {
      this.logger.log("Connected to Redis");
    } else {
      this.logger.warn("Redis is configured but unreachable — running without a cache");
    }
  }

  async onModuleDestroy(): Promise<void> {
    await closeRedis();
    this.connected = false;
  }

  /** Namespaced key builder, re-exposed so call sites never hand-roll a prefix. */
  key(...parts: (string | number)[]): string {
    return cacheKey(...parts);
  }

  /** `undefined` on a miss, on malformed JSON, or when the cache is unavailable. */
  async get<T>(key: string): Promise<T | undefined> {
    return this.safe("get", async (client) => {
      const raw = await client.get(key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // A value written by an older shape of the code is a miss, not an error.
        await client.del(key);
        return undefined;
      }
    });
  }

  /** `ttlSeconds` omitted means the entry never expires on its own. */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.safe("set", async (client) => {
      const payload = JSON.stringify(value);
      if (ttlSeconds === undefined) {
        await client.set(key, payload);
      } else {
        await client.set(key, payload, { expiration: { type: "EX", value: ttlSeconds } });
      }
    });
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.safe("del", (client) => client.del(keys));
  }

  /**
   * Invalidates a whole key group. `SCAN` rather than `KEYS` so a large keyspace is
   * walked in batches instead of blocking the server on one call.
   */
  async delByPattern(pattern: string): Promise<void> {
    await this.safe("delByPattern", async (client) => {
      for await (const keys of client.scanIterator({ MATCH: pattern, COUNT: 250 })) {
        if (keys.length > 0) await client.del(keys);
      }
    });
  }

  /**
   * Read-through: returns the cached value, otherwise runs `load`, caches it, and
   * returns it. With no cache this is just `load()`, which is what keeps call sites
   * free of `if (cache)` branches.
   */
  async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit;

    const value = await load();
    // `undefined` has no JSON representation, so caching it would poison the key.
    if (value !== undefined) await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Runs `fn` only when there is a live client, and swallows Redis failures into
   * `undefined`. One `warn` per failed operation, not per reconnect attempt.
   */
  private async safe<T>(
    operation: string,
    fn: (client: RedisClientType) => Promise<T>,
  ): Promise<T | undefined> {
    if (!this.client || !this.available) return undefined;
    try {
      return await fn(this.client);
    } catch (error) {
      this.logger.warn(`Redis ${operation} failed: ${(error as Error).message}`);
      return undefined;
    }
  }
}
