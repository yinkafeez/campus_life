import { Navigate } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useAuthQueries";
import { useMyStudent } from "../../hooks/useStudentQueries";
import PageLoader from "../ui/PageLoader";
import ErrorState from "../ui/ErrorState";

// "/" — resume the player wherever they left off.
export default function GameEntry() {
  const { data: session, isPending } = useCurrentUser();
  const student = useMyStudent({ enabled: Boolean(session) });

  if (isPending) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (student.isPending) return <PageLoader label="Resuming your game…" />;
  if (student.error)
    return <ErrorState error={student.error} onRetry={student.refetch} />;

  // still in the admission / onboarding journey → carry on there
  const done = ["active", "graduated"].includes(student.data?.status);
  return <Navigate to={done ? "/dashboard" : "/admission"} replace />;
}
