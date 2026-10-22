import { api } from "./client";

// mini-games, duels, leaderboards, campus competitions — /api/v1/games
export const getGames = ({ signal } = {}) => api.get("/games", { signal });
export const startSolo = (type) => api.post("/games/sessions", { type });
export const getSession = (id, { signal } = {}) =>
  api.get(`/games/sessions/${id}`, { signal });
export const submitSession = (id, answer) =>
  api.post(`/games/sessions/${id}/submit`, { answer });

export const getChallenges = ({ signal } = {}) =>
  api.get("/games/challenges", { signal });
export const createChallenge = (type, opponentId) =>
  api.post("/games/challenges", { type, ...(opponentId && { opponentId }) });
export const answerChallenge = (id, accept) =>
  api.post(`/games/challenges/${id}/${accept ? "accept" : "decline"}`);
export const playChallenge = (id) => api.post(`/games/challenges/${id}/play`);

export const getLeaderboard = (type, metric, { signal } = {}) =>
  api.get(`/games/leaderboards/${type}?metric=${metric}`, { signal });
export const getGameAchievements = ({ signal } = {}) =>
  api.get("/games/achievements", { signal });

export const getCompetitions = ({ signal } = {}) =>
  api.get("/games/competitions", { signal });
export const enterCompetition = (id, groupId) =>
  api.post(`/games/competitions/${id}/entries`, groupId ? { groupId } : {});
export const playCompetition = (id) =>
  api.post(`/games/competitions/${id}/play`);
