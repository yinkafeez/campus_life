import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  answerChallenge,
  createChallenge,
  enterCompetition,
  getChallenges,
  getCompetitions,
  getGameAchievements,
  getGames,
  getLeaderboard,
  getSession,
  playChallenge,
  playCompetition,
  startSolo,
  submitSession,
} from "../api/gamesApi";
import { queryKeys } from "./queryKeys";

export const useGames = () =>
  useQuery({
    queryKey: queryKeys.games,
    queryFn: async ({ signal }) => (await getGames({ signal })).games,
  });
export const useGameSession = (id) =>
  useQuery({
    queryKey: queryKeys.gameSession(id),
    queryFn: ({ signal }) => getSession(id, { signal }),
    enabled: Boolean(id),
    staleTime: Infinity, // a running game must not reshuffle on refocus
  });
export const useChallenges = () =>
  useQuery({
    queryKey: queryKeys.challenges,
    queryFn: async ({ signal }) => (await getChallenges({ signal })).challenges,
  });
export const useLeaderboard = (type, metric) =>
  useQuery({
    queryKey: queryKeys.leaderboard(type, metric),
    queryFn: async ({ signal }) =>
      (await getLeaderboard(type, metric, { signal })).leaderboard,
    enabled: Boolean(type),
  });
export const useGameAchievements = () =>
  useQuery({
    queryKey: queryKeys.gameAchievements,
    queryFn: async ({ signal }) =>
      (await getGameAchievements({ signal })).achievements,
  });
export const useCompetitions = () =>
  useQuery({
    queryKey: queryKeys.competitions,
    queryFn: async ({ signal }) =>
      (await getCompetitions({ signal })).competitions,
  });

function useGamesMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // refresh lists, boards and coins — but never the open game session itself
      queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "games" && q.queryKey[1] !== "session",
      });
      queryClient.invalidateQueries({ queryKey: ["economy"] });
    },
  });
}

// these return a session to play: { session, view, timeLimitSeconds }
export const useStartSolo = () => useGamesMutation(startSolo);
export const usePlayChallenge = () => useGamesMutation(playChallenge);
export const usePlayCompetition = () => useGamesMutation(playCompetition);
export const useSubmitSession = () =>
  useGamesMutation(({ id, answer }) => submitSession(id, answer));
export const useCreateChallenge = () =>
  useGamesMutation(({ type, opponentId }) => createChallenge(type, opponentId));
export const useAnswerChallenge = () =>
  useGamesMutation(({ id, accept }) => answerChallenge(id, accept));
export const useEnterCompetition = () =>
  useGamesMutation(({ id, groupId }) => enterCompetition(id, groupId));
