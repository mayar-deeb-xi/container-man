import type { RedisClientType } from "redis";
import { createClient } from "redis";

import { env } from "./env";

/**
 * Nest's watch mode re-evaluates modules on reload; without caching on globalThis
 * every reload would open a fresh connection and leak the previous one.
 */
const globalForCache = globalThis as unknown as {
  __containerManRedis?: RedisClientType;
};

/**
 * Redis is optional. With no REDIS_URL there is no client at all, and every helper
 * that touches it degrades to a miss — so the app boots and serves identically
 * whether or not a cache is configured.
 */
export const isCacheEnabled = Boolean(env.REDIS_URL);

function createRedis(url: string): RedisClientType {
  const client: RedisClientType = createClient({
    url,
    socket: {
      // Give up after ~10 tries instead of reconnecting forever: an unreachable
      // optional cache should settle into "disabled" rather than log in a loop.
      reconnectStrategy: (retries) =>
        retries > 10
          ? new Error("Redis: too many reconnection attempts")
          : Math.min(retries * 50, 2000),
    },
  });

  // node-redis emits 'error' on the client; without a listener a connection failure
  // becomes an unhandled 'error' event and takes the process down — which for an
  // optional dependency is exactly the wrong outcome.
  client.on("error", () => {
    // Deliberately silent: RedisService owns the logging, and the reconnect loop
    // would otherwise emit the same error a dozen times per outage.
  });

  return client;
}

const client = env.REDIS_URL
  ? (globalForCache.__containerManRedis ?? createRedis(env.REDIS_URL))
  : undefined;

if (client && process.env.NODE_ENV !== "production") {
  globalForCache.__containerManRedis = client;
}

/** `undefined` whenever Redis is not configured — check `isCacheEnabled` first. */
export const redis = client;

/**
 * Opens the connection if it is not already open. Resolves `false` instead of
 * throwing when Redis is disabled or unreachable, so a caller can log the
 * degradation and carry on.
 */
export async function connectRedis(): Promise<boolean> {
  if (!client) return false;
  try {
    if (!client.isOpen) await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Closes the connection so a SIGTERM releases the socket. No-ops in dev, where the
 * client is cached on globalThis and outlives any single watch-mode reload — closing
 * it there would hand the next reload a dead client.
 */
export async function closeRedis(): Promise<void> {
  if (!client || !client.isOpen) return;
  if (globalForCache.__containerManRedis) return;
  await client.destroy();
}

export type { RedisClientType };
