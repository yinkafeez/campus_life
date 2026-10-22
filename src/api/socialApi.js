import { api } from "./client";

// friends, profiles, blocks/mutes, privacy — /api/v1/social
export const getFriends = ({ signal } = {}) =>
  api.get("/social/friends", { signal });
export const sendFriendRequest = (username) =>
  api.post("/social/friend-requests", { username });
export const acceptFriendRequest = (id) =>
  api.post(`/social/friend-requests/${id}/accept`);
export const declineFriendRequest = (id) =>
  api.delete(`/social/friend-requests/${id}`);
export const removeFriend = (playerId) =>
  api.delete(`/social/friends/${playerId}`);

export const searchPlayers = (q, { signal } = {}) =>
  api.get(`/social/players?q=${encodeURIComponent(q)}`, { signal });
export const getProfile = (username, { signal } = {}) =>
  api.get(`/social/players/${encodeURIComponent(username)}`, { signal });

export const getRelations = ({ signal } = {}) =>
  api.get("/social/relations", { signal });
export const addRelation = (type, playerId) =>
  api.post(`/social/${type}s`, { playerId });
export const removeRelation = (type, playerId) =>
  api.delete(`/social/${type}s/${playerId}`);

export const getPrivacy = ({ signal } = {}) =>
  api.get("/social/privacy", { signal });
export const updatePrivacy = (changes) => api.patch("/social/privacy", changes);

// reports go to moderators
export const sendReport = (report) => api.post("/reports", report);
