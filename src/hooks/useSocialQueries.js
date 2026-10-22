import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptFriendRequest,
  addRelation,
  declineFriendRequest,
  getFriends,
  getPrivacy,
  getProfile,
  getRelations,
  removeFriend,
  removeRelation,
  searchPlayers,
  sendFriendRequest,
  sendReport,
  updatePrivacy,
} from "../api/socialApi";
import { queryKeys } from "./queryKeys";

export function useFriends() {
  return useQuery({
    queryKey: queryKeys.friends,
    queryFn: ({ signal }) => getFriends({ signal }),
  });
}

export function usePlayerSearch(q) {
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.playerSearch(term),
    queryFn: async ({ signal }) =>
      (await searchPlayers(term, { signal })).players,
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
}

export function useProfile(username) {
  return useQuery({
    queryKey: queryKeys.profile(username),
    queryFn: async ({ signal }) =>
      (await getProfile(username, { signal })).profile,
    enabled: Boolean(username),
  });
}

export function useRelations() {
  return useQuery({
    queryKey: queryKeys.relations,
    queryFn: ({ signal }) => getRelations({ signal }),
  });
}

export function usePrivacy() {
  return useQuery({
    queryKey: queryKeys.privacy,
    queryFn: async ({ signal }) => (await getPrivacy({ signal })).privacy,
  });
}

// anything that changes the social graph refreshes friends, relations and profiles
function useSocialMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      [
        "friends",
        "relations",
        "profile",
        "player-search",
        "conversations",
        "events",
      ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
  });
}

export const useSendFriendRequest = () => useSocialMutation(sendFriendRequest);
export const useAcceptFriendRequest = () =>
  useSocialMutation(acceptFriendRequest);
export const useDeclineFriendRequest = () =>
  useSocialMutation(declineFriendRequest);
export const useRemoveFriend = () => useSocialMutation(removeFriend);
export const useAddRelation = () =>
  useSocialMutation(({ type, playerId }) => addRelation(type, playerId));
export const useRemoveRelation = () =>
  useSocialMutation(({ type, playerId }) => removeRelation(type, playerId));

export function useUpdatePrivacy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePrivacy,
    onSuccess: ({ privacy }) =>
      queryClient.setQueryData(queryKeys.privacy, privacy),
  });
}

export function useSendReport() {
  return useMutation({ mutationFn: sendReport });
}
