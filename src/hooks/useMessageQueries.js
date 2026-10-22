import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getConversations,
  getMessages,
  markRead,
  openDirect,
  openGroupChat,
  sendMessage,
} from "../api/messagesApi";
import { queryKeys } from "./queryKeys";

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations,
    queryFn: async ({ signal }) =>
      (await getConversations({ signal })).conversations,
  });
}

/** The newest page of a thread (oldest → newest for display). Live messages arrive by socket. */
export function useMessages(conversationId) {
  return useQuery({
    queryKey: queryKeys.messages(conversationId),
    queryFn: async ({ signal }) => {
      const { messages, hasMore } = await getMessages(conversationId, {
        signal,
      });
      return { messages: [...messages].reverse(), hasMore };
    },
    enabled: Boolean(conversationId),
  });
}

export function useSendMessage(conversationId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text) => sendMessage(conversationId, text),
    onSuccess: ({ message }) => {
      appendMessage(queryClient, message);
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
    },
  });
}

export function useOpenDirect() {
  return useMutation({ mutationFn: openDirect });
}

export function useOpenGroupChat() {
  return useMutation({ mutationFn: openGroupChat });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markRead,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
  });
}

/** Add a message to its cached thread once (used by sends and by live socket pushes). */
export function appendMessage(queryClient, message) {
  queryClient.setQueryData(
    queryKeys.messages(String(message.conversation)),
    (thread) => {
      if (!thread || thread.messages.some((el) => el.id === message.id))
        return thread;
      return { ...thread, messages: [...thread.messages, message] };
    },
  );
}
