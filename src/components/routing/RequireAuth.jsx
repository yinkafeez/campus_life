import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useAuthQueries";
import { useRealtimeConnection } from "../../hooks/useRealtime";
import PageLoader from "../ui/PageLoader";
import ToastStack from "../ui/ToastStack";
import ConnectionBanner from "../ui/ConnectionBanner";

// Game screens: signed-out visitors go to the start screen.
// Signed-in players get the live connection (notifications) and the toast stack.
export default function RequireAuth() {
  const { data: session, isPending } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <PageLoader label="Loading your profile…" />;
  if (!session)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <>
      <LiveConnection />
      <Outlet />
      <ToastStack />
    </>
  );
}

// the live socket for every game screen, plus an offline strip when it is down
function LiveConnection() {
  const status = useRealtimeConnection();
  return <ConnectionBanner live={status} />;
}
