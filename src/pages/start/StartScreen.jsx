import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useAuthQueries";
import { readLastVisit, resumePathOf } from "../../lib/lastVisit";
import { hasZone, loadZone } from "../../game/world/zones";
import { FEATURED_CAMPUS, loadOverview } from "../../game/overview";
import Button from "../../components/ui/Button";
import Sheet from "../../components/ui/Sheet";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";
import styles from "./StartScreen.module.css";

const CampusOverview = lazy(() => import("../../game/overview/CampusOverview"));
const ZonePreview = lazy(() => import("../../game/overview/ZonePreview"));

/*
 * THE START SCREEN ("/", "/login", "/register")
 *   first visit  → the campus from above (Main Gate + cab terminal) and two buttons:
 *                  Create account / Log in — each opens its form in a pop-up
 *   coming back  → where you left off (your last spot in the 3D world) and one button:
 *                  Continue. Still signed in → straight back; session ended → sign in, then back.
 */
export default function StartScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session, isPending } = useCurrentUser();
  const [visit] = useState(readLastVisit);
  const [scene, setScene] = useState(null);
  // the pop-up follows the address: /login and /register open their form
  const modal =
    location.pathname === "/register"
      ? "register"
      : location.pathname === "/login"
        ? "login"
        : null;
  const [note, setNote] = useState(null);

  const returning = Boolean(visit || session);
  // where to go after "Continue" (or after signing in): where you were, else the game decides
  const resumeTo = location.state?.from ?? resumePathOf(visit);

  // background: your last spot in the world, else the featured campus from above
  useEffect(() => {
    let alive = true;
    const load =
      visit?.zone && hasZone(visit.zone)
        ? loadZone(visit.zone).then((zone) => ({ kind: "zone", zone }))
        : loadOverview(FEATURED_CAMPUS).then((data) => ({
            kind: "overview",
            data,
          }));
    load.then((s) => alive && setScene(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [visit?.zone]);

  function open(kind) {
    navigate(`/${kind}`, {
      replace: location.pathname !== "/",
      state: location.state,
    });
  }
  function close() {
    setNote(null);
    navigate("/", { replace: true, state: location.state });
  }
  function continueGame() {
    if (session) return navigate(resumeTo);
    // the sign-in period ended: sign in once, then carry on from the same place
    setNote("Your session ended. Sign in to continue where you stopped.");
    return open("login");
  }

  return (
    <div className={styles.screen}>
      <div className={styles.scene} aria-hidden="true">
        <Suspense fallback={null}>
          {scene?.kind === "zone" && (
            <ZonePreview
              zone={scene.zone}
              spot={
                visit?.x != null
                  ? { x: visit.x, z: visit.z, rotY: visit.rotY ?? Math.PI }
                  : null
              }
            />
          )}
          {scene?.kind === "overview" && (
            <CampusOverview data={scene.data} mode="hero" />
          )}
        </Suspense>
        <div className={styles.shade} />
      </div>

      <header className={styles.title}>
        <p className={styles.eyebrow}>A Nigerian campus-life game</p>
        <h1 className={styles.logo}>
          Campus<span>Life</span>
        </h1>
        {returning ? (
          <p className={styles.tagline}>
            Welcome back
            {session?.player?.displayName
              ? `, ${session.player.displayName}`
              : visit?.name
                ? `, ${visit.name}`
                : ""}
            .
            {visit?.place && (
              <>
                {" "}
                You were at <strong>{visit.place}</strong>.
              </>
            )}
          </p>
        ) : (
          <p className={styles.tagline}>
            Get admitted. Find your hostel. Live the campus.
          </p>
        )}
      </header>

      <main className={styles.actions}>
        {returning ? (
          <>
            <Button
              size="lg"
              onClick={continueGame}
              loading={isPending}
              className={styles.primary}
            >
              Continue
            </Button>
            {!session && (
              <button
                type="button"
                className={styles.other}
                onClick={() => open("register")}
              >
                New player? Create an account
              </button>
            )}
          </>
        ) : (
          <>
            <Button
              size="lg"
              onClick={() => open("register")}
              className={styles.primary}
            >
              Create account
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => open("login")}
              className={styles.primary}
            >
              Log in
            </Button>
          </>
        )}
      </main>

      <footer className={styles.footer}>
        <span>
          Fan-made, simulated game · not affiliated with any university
        </span>
        <span className={styles.links}>
          <Link to="/privacy">Privacy & rules</Link>
          <Link to="/status">Server status</Link>
        </span>
      </footer>

      {modal === "login" && (
        <Sheet title="Log in" onClose={close}>
          <LoginPage
            bare
            note={note}
            onSwitch={() => open("register")}
            onSuccess={() => navigate(resumeTo, { replace: true })}
          />
        </Sheet>
      )}
      {modal === "register" && (
        <Sheet title="Create account" onClose={close}>
          {/* a new player first sees the whole campus, then applies */}
          <RegisterPage
            bare
            onSwitch={() => open("login")}
            onSuccess={() => navigate("/welcome", { replace: true })}
          />
        </Sheet>
      )}
    </div>
  );
}
