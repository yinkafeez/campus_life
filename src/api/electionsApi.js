import { api } from "./client";

// student elections and leadership (game) — /api/v1/elections
export const getElections = ({ signal } = {}) =>
  api.get("/elections", { signal });
export const getElection = (id, { signal } = {}) =>
  api.get(`/elections/${id}`, { signal });
export const getElectionAudit = (id, { signal } = {}) =>
  api.get(`/elections/${id}/audit`, { signal });

export const nominate = (id, candidacy) =>
  api.post(`/elections/${id}/candidacy`, candidacy);
export const updateCandidacy = (id, changes) =>
  api.patch(`/elections/${id}/candidacy`, changes);
export const withdrawCandidacy = (id) =>
  api.delete(`/elections/${id}/candidacy`);
export const addCampaignItem = (id, item) =>
  api.post(`/elections/${id}/campaign`, item);
export const supportCandidate = (id, candidacyId, kind) =>
  api.post(`/elections/${id}/support`, { candidacyId, kind });
export const removeSupport = (id, kind) =>
  api.delete(`/elections/${id}/support/${kind}`);

export const castBallot = (id, candidacyIds) =>
  api.post(`/elections/${id}/ballots`, { candidacyIds });
export const verifyBallot = (id, code) =>
  api.post(`/elections/${id}/ballots/verify`, { code });
export const fileDispute = (id, reason) =>
  api.post(`/elections/${id}/disputes`, { reason });

export const getMyOffices = ({ signal } = {}) =>
  api.get("/elections/offices/me", { signal });
export const getLeaders = ({ signal } = {}) =>
  api.get("/elections/leaders", { signal });
export const getAnnouncements = ({ signal } = {}) =>
  api.get("/elections/announcements", { signal });
export const postAnnouncement = (officeId, announcement) =>
  api.post(`/elections/offices/${officeId}/announcements`, announcement);
export const postOfficialEvent = (officeId, event) =>
  api.post(`/elections/offices/${officeId}/events`, event);
export const postWelfareGrant = (officeId, grant) =>
  api.post(`/elections/offices/${officeId}/welfare-grants`, grant);
