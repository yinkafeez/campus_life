import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  advanceLevel,
  getAchievements,
  getActivities,
  getActivity,
  getMissions,
  getRecentAttempts,
  getStanding,
  startAttempt,
  submitAttempt,
} from "../api/learningApi";
import { queryKeys } from "./queryKeys";

export function useStanding() {
  return useQuery({
    queryKey: queryKeys.standing,
    queryFn: async ({ signal }) => (await getStanding({ signal })).standing,
  });
}

export function useActivities() {
  return useQuery({
    queryKey: queryKeys.learningActivities,
    queryFn: async ({ signal }) => (await getActivities({ signal })).activities,
  });
}

export function useActivity(key) {
  return useQuery({
    queryKey: queryKeys.learningActivity(key),
    queryFn: ({ signal }) => getActivity(key, { signal }),
    enabled: Boolean(key),
  });
}

export function useMissions({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.missions,
    queryFn: async ({ signal }) => (await getMissions({ signal })).missions,
    enabled,
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: queryKeys.achievements,
    queryFn: async ({ signal }) =>
      (await getAchievements({ signal })).achievements,
  });
}

export function useRecentAttempts() {
  return useQuery({
    queryKey: queryKeys.recentAttempts,
    queryFn: async ({ signal }) =>
      (await getRecentAttempts({ signal })).attempts,
  });
}

export function useStartAttempt() {
  return useMutation({ mutationFn: startAttempt });
}

// anything that changes progress refreshes every studies view (and the student record)
function useRefreshStudies() {
  const queryClient = useQueryClient();
  return () =>
    [
      ["learning"],
      queryKeys.standing,
      queryKeys.missions,
      queryKeys.achievements,
      queryKeys.recentAttempts,
      queryKeys.myStudent,
    ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
}

export function useSubmitAttempt() {
  const refresh = useRefreshStudies();
  return useMutation({
    mutationFn: ({ attemptId, answer }) => submitAttempt(attemptId, answer),
    onSuccess: refresh,
  });
}

export function useAdvanceLevel() {
  const refresh = useRefreshStudies();
  return useMutation({ mutationFn: advanceLevel, onSuccess: refresh });
}
