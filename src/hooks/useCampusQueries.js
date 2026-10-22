import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { discoverLocation, doActivity, getCampusWorld } from "../api/campusApi";
import { queryKeys } from "./queryKeys";

/** My campus: { university, world, locations, npcs, discoveries }. */
export function useCampusWorld() {
  return useQuery({
    queryKey: queryKeys.campusWorld,
    queryFn: ({ signal }) => getCampusWorld({ signal }),
    staleTime: 5 * 60_000,
  });
}

// a discovery flips `discovered` on that location in the cached world (no refetch)
export function useDiscoverLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: discoverLocation,
    onSuccess: (data, slug) => {
      queryClient.setQueryData(queryKeys.campusWorld, (world) =>
        world
          ? {
              ...world,
              locations: world.locations.map((el) =>
                el.slug === slug ? { ...el, discovered: true } : el,
              ),
            }
          : world,
      );
    },
  });
}

// an activity can complete a mission step (e.g. "study at the library")
export function useDoActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: doActivity,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.missions }),
  });
}
