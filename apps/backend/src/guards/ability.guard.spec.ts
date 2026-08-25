import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { RequiredAbility } from "../decorators/require-ability.decorator";
import type { AbilityService, UserAccess } from "../lib/ability/ability.service";
import { AbilityGuard } from "./ability.guard";

interface FakeRequest {
  user?: { sub: string };
  ability?: unknown;
  roles?: unknown;
}

function harness(options: {
  required?: RequiredAbility[];
  request?: FakeRequest;
  access?: UserAccess | null;
}) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(options.required),
  } as unknown as Reflector;

  const abilities = {
    forUser: vi.fn().mockResolvedValue(options.access ?? null),
  } as unknown as AbilityService;

  const request: FakeRequest = options.request ?? { user: { sub: "user-1" } };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;

  return { guard: new AbilityGuard(reflector, abilities), context, request, abilities };
}

const access = (rules: UserAccess["rules"]): UserAccess => ({ roles: [], rules });

describe("AbilityGuard", () => {
  it("refuses an unauthenticated request", async () => {
    const { guard, context } = harness({ request: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("refuses a valid token whose account is gone", async () => {
    const { guard, context } = harness({ access: null });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it("attaches the resolved ability even when the route declares nothing", async () => {
    const { guard, context, request } = harness({
      required: undefined,
      access: access([{ action: "read", subject: "Container" }]),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.ability).toBeDefined();
    expect(request.roles).toEqual([]);
  });

  it("passes when every required pair is granted", async () => {
    const { guard, context } = harness({
      required: [{ action: "read", subject: "Container" }],
      access: access([{ action: "manage", subject: "all" }]),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("a conditional grant satisfies the route-level check — the row decides later", async () => {
    // The guard asks the subject-level question; `can("read", "Container")` is true for a
    // conditional rule even though individual rows may still be excluded by the services.
    const { guard, context } = harness({
      required: [{ action: "read", subject: "Container" }],
      access: access([
        { action: "read", subject: "Container", conditions: { assignedToId: "user-1" } },
      ]),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("refuses a pair nothing grants, with the flat message", async () => {
    const { guard, context } = harness({
      required: [{ action: "delete", subject: "Container" }],
      access: access([{ action: "read", subject: "Container" }]),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow("Insufficient permissions");
  });
});
