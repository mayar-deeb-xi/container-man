import type { Request } from "express";

import type { AccessTokenPayload, RefreshTokenPayload } from "@repo/auth";

export interface RequestWithUser extends Request {
  user: AccessTokenPayload;
}

export interface RequestWithRefresh extends Request {
  refresh: {
    payload: RefreshTokenPayload;
    /** The raw token, needed to compare against the stored SHA-256 digest. */
    token: string;
  };
}
