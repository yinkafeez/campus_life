import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCampaignItem,
  castBallot,
  fileDispute,
  getAnnouncements,
  getElection,
  getElections,
  getLeaders,
  getMyOffices,
  nominate,
  postAnnouncement,
  postOfficialEvent,
  postWelfareGrant,
  removeSupport,
  supportCandidate,
  updateCandidacy,
  verifyBallot,
  withdrawCandidacy,
} from "../api/electionsApi";
import { queryKeys } from "./queryKeys";

export const useElections = () =>
  useQuery({
    queryKey: queryKeys.elections,
    queryFn: async ({ signal }) => (await getElections({ signal })).elections,
    retry: (count, error) => error?.code !== "NOT_ENROLLED" && count < 2,
  });
export const useElection = (id) =>
  useQuery({
    queryKey: queryKeys.election(id),
    queryFn: ({ signal }) => getElection(id, { signal }),
    enabled: Boolean(id),
  });
export const useMyOffices = () =>
  useQuery({
    queryKey: queryKeys.myOffices,
    queryFn: async ({ signal }) => (await getMyOffices({ signal })).offices,
  });
export const useLeaders = () =>
  useQuery({
    queryKey: queryKeys.leaders,
    queryFn: async ({ signal }) => (await getLeaders({ signal })).leaders,
  });
export const useAnnouncements = () =>
  useQuery({
    queryKey: queryKeys.announcements,
    queryFn: async ({ signal }) =>
      (await getAnnouncements({ signal })).announcements,
  });

function useElectionsMutation(mutationFn, { alsoEconomy = false } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      if (alsoEconomy) queryClient.invalidateQueries({ queryKey: ["economy"] });
    },
  });
}

export const useNominate = () =>
  useElectionsMutation(({ id, ...candidacy }) => nominate(id, candidacy));
export const useUpdateCandidacy = () =>
  useElectionsMutation(({ id, ...changes }) => updateCandidacy(id, changes));
export const useWithdraw = () => useElectionsMutation(withdrawCandidacy);
export const useAddCampaignItem = () =>
  useElectionsMutation(({ id, ...item }) => addCampaignItem(id, item));
export const useSupport = () =>
  useElectionsMutation(({ id, candidacyId, kind, remove }) =>
    remove ? removeSupport(id, kind) : supportCandidate(id, candidacyId, kind),
  );
export const useCastBallot = () =>
  useElectionsMutation(({ id, candidacyIds }) => castBallot(id, candidacyIds));
// verifying changes nothing on the server — no refetch
export const useVerifyBallot = () =>
  useMutation({ mutationFn: ({ id, code }) => verifyBallot(id, code) });
export const useFileDispute = () =>
  useElectionsMutation(({ id, reason }) => fileDispute(id, reason));

export const useAnnounce = () =>
  useElectionsMutation(({ officeId, ...a }) => postAnnouncement(officeId, a));
export const useOfficialEvent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ officeId, ...event }) => postOfficialEvent(officeId, event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["elections"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.events });
    },
  });
};
export const useWelfareGrant = () =>
  useElectionsMutation(({ officeId, ...g }) => postWelfareGrant(officeId, g), {
    alsoEconomy: true,
  });
