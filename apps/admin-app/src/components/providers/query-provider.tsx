"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { isUnauthorized, setSessionExpiredHandler } from "~/lib/axios";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Created in state, not at module scope: a module-level client would be shared
  // across concurrent SSR requests and leak one user's data into another's render.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 2,
          },
          mutations: { retry: false },
        },
      }),
  );

  useEffect(() => {
    setSessionExpiredHandler(() => {
      queryClient.clear();
      router.replace("/login");
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient, router]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
