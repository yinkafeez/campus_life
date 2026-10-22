import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMe, login, logout, register } from "../api/authApi";
import { updateMyPlayer } from "../api/playersApi";
import { queryKeys } from "./queryKeys";

/** { user, player } when signed in, null when not (a 401 is an answer, not an error). */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: async ({ signal }) => {
      try {
        return await getMe({ signal });
      } catch (err) {
        if (err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// register and login both answer { user, player } and set the session cookies
function useSignIn(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.removeQueries({ queryKey: queryKeys.myStudent });
      queryClient.setQueryData(queryKeys.currentUser, data);
    },
  });
}

export const useRegister = () => useSignIn(register);
export const useLogin = () => useSignIn(login);

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.currentUser, null);
    },
  });
}

export function useUpdatePlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMyPlayer,
    onSuccess: ({ player }) => {
      queryClient.setQueryData(
        queryKeys.currentUser,
        (prev) => prev && { ...prev, player },
      );
    },
  });
}
