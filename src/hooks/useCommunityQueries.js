import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  answerInvitation,
  cancelEvent,
  createEvent,
  createGroup,
  getEvents,
  getGroups,
  getInvitations,
  joinGroup,
  leaveGroup,
  rsvp,
  sendInvitation,
} from "../api/communityApi";
import { queryKeys } from "./queryKeys";

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: async ({ signal }) => (await getGroups({ signal })).groups,
  });
}

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: async ({ signal }) => (await getEvents({ signal })).events,
  });
}

export function useInvitations() {
  return useQuery({
    queryKey: queryKeys.invitations,
    queryFn: async ({ signal }) =>
      (await getInvitations({ signal })).invitations,
  });
}

function useCommunityMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      [
        queryKeys.groups,
        queryKeys.events,
        queryKeys.invitations,
        queryKeys.conversations,
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    },
  });
}

export const useCreateGroup = () => useCommunityMutation(createGroup);
export const useJoinGroup = () => useCommunityMutation(joinGroup);
export const useLeaveGroup = () => useCommunityMutation(leaveGroup);
export const useCreateEvent = () => useCommunityMutation(createEvent);
export const useCancelEvent = () => useCommunityMutation(cancelEvent);
export const useRsvp = () =>
  useCommunityMutation(({ id, going }) => rsvp(id, going));
export const useSendInvitation = () => useCommunityMutation(sendInvitation);
export const useAnswerInvitation = () =>
  useCommunityMutation(({ id, accept }) => answerInvitation(id, accept));
