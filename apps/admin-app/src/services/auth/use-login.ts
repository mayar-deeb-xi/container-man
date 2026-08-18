"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "~/lib/axios";
import { sessionKey } from "./use-session";

export interface LoginPayload {
  email: string;
  password: string;
}

/** Answers 204: the session is the cookies it sets. Use `getMe` for the user. */
export async function login(payload: LoginPayload): Promise<void> {
  await api.post("/auth/login", payload);
}

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: login,
    onSuccess: () => {
      // Nothing to seed — login hands back no user. Dropping the entry instead:
      // whatever is cached under this key was fetched while signed out (a 401),
      // and leaving it would have the next `useSession` render it as the answer.
      queryClient.removeQueries({ queryKey: sessionKey });
    },
    onSettled: () => {
      // refresh() re-runs the server components so the proxy sees the new cookie.
      router.refresh();
    },
  });
}
