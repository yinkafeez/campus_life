import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getHostels,
  getMyAccommodation,
  requestBed,
  vacateBed,
} from "../api/accommodationApi";
import { queryKeys } from "./queryKeys";

export function useHostels() {
  return useQuery({
    queryKey: queryKeys.hostels,
    queryFn: ({ signal }) => getHostels({ signal }),
  });
}

export function useMyAccommodation() {
  return useQuery({
    queryKey: queryKeys.myAccommodation,
    queryFn: ({ signal }) => getMyAccommodation({ signal }),
  });
}

function useAccommodationMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.myAccommodation });
      queryClient.invalidateQueries({ queryKey: queryKeys.hostels });
    },
  });
}

export const useRequestBed = () => useAccommodationMutation(requestBed);
export const useVacateBed = () => useAccommodationMutation(vacateBed);
