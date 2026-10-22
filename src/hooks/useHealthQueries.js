import { useQuery } from "@tanstack/react-query";
import { getApiHealth } from "../api/healthApi";
import { queryKeys } from "./queryKeys";

/** Backend liveness + database state, refreshed while the page is open. */
export function useApiHealth({ refetchInterval = 15_000 } = {}) {
  return useQuery({
    queryKey: queryKeys.apiHealth,
    queryFn: ({ signal }) => getApiHealth({ signal }),
    refetchInterval,
    retry: false,
  });
}
