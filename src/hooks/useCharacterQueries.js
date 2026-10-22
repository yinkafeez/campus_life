import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCharacter,
  getMyCharacter,
  getWardrobe,
  saveOutfit,
  savePosition,
  updateLook,
  wearOutfit,
} from "../api/charactersApi";
import { queryKeys } from "./queryKeys";

/**
 * The wardrobe: catalogue + palettes + what I own. Adds lookup helpers the 3D renderer and
 * the creator need (itemsByKey, owned set, items by slot).
 */
export function useWardrobe() {
  const query = useQuery({
    queryKey: queryKeys.wardrobe,
    queryFn: ({ signal }) => getWardrobe({ signal }),
    staleTime: 5 * 60_000,
  });

  const catalogue = useMemo(() => {
    if (!query.data) return null;
    const { items, owned } = query.data;
    return {
      ...query.data,
      itemsByKey: new Map(items.map((el) => [el.key, el])),
      owned: new Set(owned.map((el) => el.itemKey)),
      bySlot: Map.groupBy(items, (el) => el.slot),
    };
  }, [query.data]);

  return { ...query, catalogue };
}

/** My character, or null before it's created. */
export function useMyCharacter() {
  return useQuery({
    queryKey: queryKeys.myCharacter,
    queryFn: async ({ signal }) => {
      try {
        return (await getMyCharacter({ signal })).character;
      } catch (err) {
        if (err.code === "NO_CHARACTER") return null;
        throw err;
      }
    },
  });
}

// every character mutation answers { character } — write it straight into the cache
function useCharacterMutation(mutationFn, { refreshWardrobe = false } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: ({ character }) => {
      queryClient.setQueryData(queryKeys.myCharacter, character);
      // creating a character grants the starter kit → "owned" changes
      if (refreshWardrobe)
        queryClient.invalidateQueries({ queryKey: queryKeys.wardrobe });
    },
  });
}

export const useCreateCharacter = () =>
  useCharacterMutation(createCharacter, { refreshWardrobe: true });
export const useUpdateLook = () => useCharacterMutation(updateLook);
export const useSaveOutfit = () =>
  useCharacterMutation(({ occasion, slots }) => saveOutfit(occasion, slots));
export const useWearOutfit = () => useCharacterMutation(wearOutfit);

// position saves are fire-and-forget: they must not re-render the 3D scene
export function useSavePosition() {
  return useMutation({ mutationFn: savePosition });
}
