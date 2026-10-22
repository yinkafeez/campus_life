import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  abandonJob,
  acceptJob,
  buyItem,
  claimAllowance,
  completeJob,
  getBills,
  getBudget,
  getHustles,
  getInventory,
  getJob,
  getRecentJobs,
  getShop,
  getTransactions,
  getWallet,
  giftItem,
  moveSavings,
  payBill,
  setPlan,
  consumeItem,
} from "../api/economyApi";
import { queryKeys } from "./queryKeys";

export function useWallet(options = {}) {
  return useQuery({
    queryKey: queryKeys.wallet,
    queryFn: async ({ signal }) => (await getWallet({ signal })).wallet,
    ...options,
  });
}

export const useTransactions = () =>
  useQuery({
    queryKey: queryKeys.transactions,
    queryFn: ({ signal }) => getTransactions({ signal }),
  });
export const useBudget = () =>
  useQuery({
    queryKey: queryKeys.budget,
    queryFn: async ({ signal }) => (await getBudget({ signal })).budget,
  });
export const useBills = () =>
  useQuery({
    queryKey: queryKeys.bills,
    queryFn: async ({ signal }) => (await getBills({ signal })).bills,
  });
export const useShop = () =>
  useQuery({
    queryKey: queryKeys.shop,
    queryFn: async ({ signal }) => (await getShop({ signal })).items,
  });
export const useInventory = () =>
  useQuery({
    queryKey: queryKeys.inventory,
    queryFn: async ({ signal }) => (await getInventory({ signal })).items,
  });
export const useHustles = () =>
  useQuery({
    queryKey: queryKeys.hustles,
    queryFn: async ({ signal }) => (await getHustles({ signal })).hustles,
  });
export const useJob = (id) =>
  useQuery({
    queryKey: queryKeys.job(id),
    queryFn: ({ signal }) => getJob(id, { signal }),
    enabled: Boolean(id),
  });
export const useRecentJobs = () =>
  useQuery({
    queryKey: queryKeys.recentJobs,
    queryFn: async ({ signal }) => (await getRecentJobs({ signal })).jobs,
  });

// any money/item change refreshes every economy view (and the wardrobe for clothes)
function useEconomyMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      [["economy"], queryKeys.wardrobe].forEach((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
  });
}

export const useClaimAllowance = () => useEconomyMutation(claimAllowance);
export const useSetPlan = () => useEconomyMutation(setPlan);
export const useMoveSavings = () =>
  useEconomyMutation(({ direction, amount }) => moveSavings(direction, amount));
export const usePayBill = () => useEconomyMutation(payBill);
export const useBuyItem = () =>
  useEconomyMutation(({ itemKey, quantity, requestKey }) =>
    buyItem(itemKey, quantity, requestKey),
  );
export const useConsumeItem = () => useEconomyMutation(consumeItem);
export const useGiftItem = () => useEconomyMutation(giftItem);
export const useAcceptJob = () => useEconomyMutation(acceptJob);
export const useCompleteJob = () =>
  useEconomyMutation(({ id, answer }) => completeJob(id, answer));
export const useAbandonJob = () => useEconomyMutation(abandonJob);
