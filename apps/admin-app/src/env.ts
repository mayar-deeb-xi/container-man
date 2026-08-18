import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.url({
      error: "NEXT_PUBLIC_API_URL must be the full backend URL, e.g. http://localhost:3001",
    }),
  },
  // Next.js only inlines statically-analyzable `process.env.X` references, so
  // each variable has to be listed literally here.
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  emptyStringAsUndefined: true,
});
