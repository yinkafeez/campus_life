import { api } from "./client";

// groups, hangouts/events, invitations — /api/v1/community
export const getGroups = ({ signal } = {}) =>
  api.get("/community/groups", { signal });
export const createGroup = (group) => api.post("/community/groups", group);
export const joinGroup = (id) => api.post(`/community/groups/${id}/members`);
export const leaveGroup = (id) =>
  api.delete(`/community/groups/${id}/members/me`);

export const getEvents = ({ signal } = {}) =>
  api.get("/community/events", { signal });
export const createEvent = (event) => api.post("/community/events", event);
export const cancelEvent = (id) => api.delete(`/community/events/${id}`);
export const rsvp = (id, going) =>
  going
    ? api.post(`/community/events/${id}/rsvp`)
    : api.delete(`/community/events/${id}/rsvp`);

export const getInvitations = ({ signal } = {}) =>
  api.get("/community/invitations", { signal });
export const sendInvitation = (invitation) =>
  api.post("/community/invitations", invitation);
export const answerInvitation = (id, accept) =>
  api.post(`/community/invitations/${id}/${accept ? "accept" : "decline"}`);
