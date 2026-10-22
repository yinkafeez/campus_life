import { api } from "./client";

// direct and group messages — /api/v1/messages
export const getConversations = ({ signal } = {}) =>
  api.get("/messages/conversations", { signal });
export const openDirect = (playerId) =>
  api.post("/messages/conversations/direct", { playerId });
export const openGroupChat = (groupId) =>
  api.post("/messages/conversations/group", { groupId });

export function getMessages(conversationId, { before, signal } = {}) {
  const query = before ? `?before=${before}` : "";
  return api.get(`/messages/conversations/${conversationId}/messages${query}`, {
    signal,
  });
}

export const sendMessage = (conversationId, text) =>
  api.post(`/messages/conversations/${conversationId}/messages`, { text });
export const markRead = (conversationId) =>
  api.post(`/messages/conversations/${conversationId}/read`);
