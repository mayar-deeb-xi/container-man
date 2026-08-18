import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Server-only: the browser never calls the backend directly — it goes through
    // the /api/backend rewrite in next.config.ts, so this URL stays out of the
    // client bundle.
    API_URL: z.url({
      error: "API_URL must be the full backend URL, e.g. http://localhost:3001",
    }),
  },
  // Next.js only inlines statically-analyzable `process.env.X` references, so
  // each variable has to be listed literally here.
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    API_URL: process.env.API_URL,
  },
  emptyStringAsUndefined: true,
});
