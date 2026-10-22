import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyForAdmission,
  completeOnboardingStep,
  getMyStudent,
  matriculate,
  respondToOffer,
} from "../api/studentsApi";
import { getAdmissionOptions, getUniversities } from "../api/universitiesApi";
import { queryKeys } from "./queryKeys";

/** The signed-in player's simulated student record, or null before they apply. */
export function useMyStudent({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.myStudent,
    enabled,
    queryFn: async ({ signal }) => {
      try {
        return (await getMyStudent({ signal })).student;
      } catch (err) {
        if (err.code === "NO_STUDENT_RECORD") return null;
        throw err;
      }
    },
    // while the simulated review runs, check back every second
    refetchInterval: (query) =>
      query.state.data?.status === "under_review" ? 1000 : false,
  });
}

export function useUniversities() {
  return useQuery({
    queryKey: queryKeys.universities,
    queryFn: ({ signal }) => getUniversities({ signal }),
    staleTime: 10 * 60_000,
  });
}

export function useAdmissionOptions(slug) {
  return useQuery({
    queryKey: queryKeys.admissionOptions(slug),
    queryFn: ({ signal }) => getAdmissionOptions(slug, { signal }),
    enabled: Boolean(slug),
    staleTime: 10 * 60_000,
  });
}

// every journey step answers { student } — write it straight into the cache
function useStudentMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: ({ student }) =>
      queryClient.setQueryData(queryKeys.myStudent, student),
  });
}

export const useApply = () => useStudentMutation(applyForAdmission);
export const useRespondToOffer = () => useStudentMutation(respondToOffer);
export const useMatriculate = () => useStudentMutation(matriculate);
export const useCompleteStep = () => useStudentMutation(completeOnboardingStep);
