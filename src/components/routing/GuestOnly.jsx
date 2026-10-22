import { Navigate, Outlet } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useAuthQueries";
import PageLoader from "../ui/PageLoader";

// Login / register: a signed-in player goes straight back into the game.
export default function GuestOnly() {
  const { data: session, isPending } = useCurrentUser();

  if (isPending) return <PageLoader />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}
