import { QueryClient } from "@tanstack/react-query";
import { setSessionLostHandler } from "../api/client";
import { queryKeys } from "../hooks/queryKeys";

// Don't retry 4xx — a 403/404 won't fix itself. Retry network blips and 5xx twice.
const shouldRetry = (count, err) =>
  count < 2 && (err?.status === 0 || (err?.status ?? 500) >= 500);

export function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
      mutations: { retry: false },
    },
  });

  // the server ended the session (expired / revoked): drop to signed-out everywhere
  setSessionLostHandler(() => {
    if (!queryClient.getQueryData(queryKeys.currentUser)) return;
    queryClient.clear();
    queryClient.setQueryData(queryKeys.currentUser, null);
  });

  return queryClient;
}
