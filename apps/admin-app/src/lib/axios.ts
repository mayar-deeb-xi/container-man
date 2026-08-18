import type { AxiosRequestConfig } from "axios";
import axios, { AxiosError } from "axios";

/** Marks a request that has already been replayed, so a retry can't recurse. */
interface RetriableConfig extends AxiosRequestConfig {
  _retry?: boolean;
}

export const api = axios.create({
  // Same-origin path, rewritten to the backend in next.config.ts. Routing
  // through this app's own origin is what makes the httpOnly auth cookies
  // first-party, so the browser stores them and proxy.ts can read them.
  baseURL: "/api/backend",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

/**
 * Shared in-flight refresh. Several React Query fetches routinely 401 at the same
 * moment when the access token expires; without this they would each fire their
 * own /auth/refresh, and because refresh rotates the token, the second one would
 * present an already-used token and trip reuse-detection — logging the user out
 * for doing nothing wrong.
 */
let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshPromise ??= api
    .post("/auth/refresh", undefined, { _retry: true } as RetriableConfig)
    .then(() => undefined)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/** Set by the QueryProvider so a dead session can clear the cache and redirect. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    if (error.response?.status !== 401 || !config || config._retry) {
      return Promise.reject(error);
    }

    config._retry = true;

    try {
      await refreshSession();
    } catch {
      onSessionExpired?.();
      return Promise.reject(error);
    }

    return api.request(config);
  },
);

/** Narrows an unknown error to the backend's JSON error body. */
export function getApiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message[0] ?? fallback;
    if (typeof message === "string") return message;
  }
  return fallback;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof AxiosError && error.response?.status === 401;
}

/** A uniqueness clash — an email already taken, in practice. */
export function isConflict(error: unknown): boolean {
  return error instanceof AxiosError && error.response?.status === 409;
}
