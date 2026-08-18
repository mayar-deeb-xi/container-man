import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@repo/auth";

import { env } from "~/env";

const LOGIN_PATH = "/login";
const DEFAULT_AUTHED_PATH = "/dashboard";

/** Routes that only make sense when signed out. */
const PUBLIC_ONLY = [LOGIN_PATH];

/** Treat a token that expires within this window as already expired. */
const CLOCK_SKEW_MS = 5_000;

/**
 * Reads `exp` without verifying the signature.
 *
 * Verifying here would mean shipping the backend's signing secret into this app,
 * which would let the frontend mint tokens. An unverified read is safe because
 * nothing is authorized on the result: a forged `exp` only changes whether we
 * bother attempting a refresh, and the backend still verifies every request.
 */
function isUsable(token: string | undefined): boolean {
  if (!token) return false;

  const payload = token.split(".")[1];
  if (!payload) return false;

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { exp } = JSON.parse(json) as { exp?: number };
    return typeof exp === "number" && exp * 1000 > Date.now() + CLOCK_SKEW_MS;
  } catch {
    return false;
  }
}

interface RefreshOutcome {
  setCookies: string[];
  accessToken?: string;
  refreshToken?: string;
}

function readCookie(setCookie: string, name: string): string | undefined {
  const match = new RegExp(`^${name}=([^;]*)`).exec(setCookie);
  return match?.[1];
}

async function refreshTokens(refreshToken: string): Promise<RefreshOutcome | null> {
  try {
    const response = await fetch(`${env.API_URL}/auth/refresh`, {
      method: "POST",
      headers: { cookie: `${REFRESH_TOKEN_COOKIE}=${refreshToken}` },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const setCookies = response.headers.getSetCookie();
    return {
      setCookies,
      accessToken: setCookies.map((c) => readCookie(c, ACCESS_TOKEN_COOKIE)).find(Boolean),
      refreshToken: setCookies.map((c) => readCookie(c, REFRESH_TOKEN_COOKIE)).find(Boolean),
    };
  } catch {
    // Backend unreachable — fall back to the signed-out path.
    return null;
  }
}

/**
 * Routing guard and token refresher.
 *
 * The refresh has to happen here rather than in a server component: server
 * components cannot set cookies, so they can only observe that the access token
 * expired, never fix it. Without this, an expired access token plus a valid
 * refresh token sends /dashboard to /login, which bounces back to /dashboard,
 * forever. Proxy is the one place that can call the backend *and* write the
 * rotated cookies onto the response.
 *
 * This is still not an authorization boundary — `getServerSession()` does the
 * real check by asking the backend.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublicOnly = PUBLIC_ONLY.includes(pathname);

  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (isUsable(accessToken)) {
    return isPublicOnly
      ? NextResponse.redirect(new URL(DEFAULT_AUTHED_PATH, request.url))
      : NextResponse.next();
  }

  if (refreshToken) {
    const refreshed = await refreshTokens(refreshToken);

    if (refreshed) {
      const response = isPublicOnly
        ? NextResponse.redirect(new URL(DEFAULT_AUTHED_PATH, request.url))
        : NextResponse.next({
            // Hand the *new* cookies to the server components rendering this same
            // request, so getServerSession() doesn't reuse the stale access token.
            request: { headers: withRefreshedCookies(request, refreshed) },
          });

      for (const cookie of refreshed.setCookies) {
        response.headers.append("set-cookie", cookie);
      }
      return response;
    }
    // Refresh failed — the session is genuinely dead, so fall through and clear.
  }

  if (isPublicOnly) {
    return clearAuthCookies(NextResponse.next());
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);
  // Preserve where they were headed so login can send them back.
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return clearAuthCookies(NextResponse.redirect(loginUrl));
}

function withRefreshedCookies(request: NextRequest, refreshed: RefreshOutcome): Headers {
  const headers = new Headers(request.headers);
  const cookies = request.cookies;

  if (refreshed.accessToken) cookies.set(ACCESS_TOKEN_COOKIE, refreshed.accessToken);
  if (refreshed.refreshToken) cookies.set(REFRESH_TOKEN_COOKIE, refreshed.refreshToken);

  headers.set(
    "cookie",
    cookies
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; "),
  );
  return headers;
}

function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  return response;
}

export const config = {
  matcher: [
    // Everything except the backend rewrite, Next internals, metadata files, and
    // static assets. api/backend must be excluded because this proxy runs before
    // rewrites: intercepting it would answer an unauthenticated XHR with a
    // redirect to the login *page* instead of letting it reach the backend.
    "/((?!api/backend|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
