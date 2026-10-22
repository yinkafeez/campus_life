import { api } from "./client";

// game studies (simulated) — /api/v1/learning
export const getStanding = ({ signal } = {}) =>
  api.get("/learning/standing", { signal });
export const advanceLevel = () => api.post("/learning/progression/advance");

export const getActivities = ({ signal } = {}) =>
  api.get("/learning/activities", { signal });
export const getActivity = (key, { signal } = {}) =>
  api.get(`/learning/activities/${key}`, { signal });
export const startAttempt = (key) =>
  api.post(`/learning/activities/${key}/attempts`);
export const submitAttempt = (attemptId, answer) =>
  api.post(`/learning/attempts/${attemptId}/submit`, { answer });
export const getRecentAttempts = ({ signal } = {}) =>
  api.get("/learning/attempts", { signal });

export const getMissions = ({ signal } = {}) =>
  api.get("/learning/missions", { signal });
export const getAchievements = ({ signal } = {}) =>
  api.get("/learning/achievements", { signal });
