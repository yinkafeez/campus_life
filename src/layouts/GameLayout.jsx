import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LuEllipsis, LuGraduationCap, LuLogOut, LuMap } from "react-icons/lu";
import { useCurrentUser, useLogout } from "../hooks/useAuthQueries";
import { useMyStudent } from "../hooks/useStudentQueries";
import { useWallet } from "../hooks/useEconomyQueries";
import { destinationsFor } from "../lib/destinations";
import NotificationBell from "../components/nav/NotificationBell";
import Sheet from "../components/ui/Sheet";
import styles from "./GameLayout.module.css";

const JOURNEY = {
  key: "journey",
  label: "Admission",
  to: "/admission",
  icon: LuGraduationCap,
  primary: true,
};

/** Is this link the current screen? (tab links like /social?tab=messages match by path) */
const isHere = (location, to) => location.pathname === to.split("?")[0];

/**
 * In-game screens: a slim header over the scene (all destinations on wide screens),
 * a thumb-reachable bottom bar + "More" sheet on phones, and the screen below.
 */
export default function GameLayout() {
  const { data: session } = useCurrentUser();
  const { data: student } = useMyStudent();
  const wallet = useWallet({ retry: false });
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [more, setMore] = useState(false);
  const enrolled = ["active", "graduated"].includes(student?.status);

  const all = destinationsFor({
    enrolled,
    admin: session?.user?.role === "admin",
  });
  const header = [
    ...(enrolled ? [] : [JOURNEY]),
    ...all.filter((d) => !d.menuOnly && d.key !== "campus"),
  ];
  const bottom = [
    ...all.filter((d) => d.primary).slice(0, 1),
    ...(enrolled ? [] : [JOURNEY]),
    ...all.filter((d) => d.primary).slice(1),
  ].slice(0, 4);

  function handleLogout() {
    logout.mutate(undefined, {
      onSettled: () => navigate("/login", { replace: true }),
    });
  }

  return (
    <div className={styles.screen}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.hud}>
        <NavLink to="/" className={styles.brand} aria-label="Campus Life home">
          C<span>L</span>
        </NavLink>

        {/* the 3D world is the heart of the game: always one tap away */}
        <NavLink to="/play" className={styles.campus}>
          <LuMap aria-hidden="true" />
          <span>Campus</span>
        </NavLink>

        <nav aria-label="Game" className={styles.nav}>
          {header.map((d) => (
            <NavLink
              key={d.key}
              to={d.to}
              className={({ isActive }) =>
                isActive ? styles.linkActive : styles.link
              }
            >
              {d.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.player}>
          {wallet.data && (
            <NavLink
              to="/money"
              className={styles.coins}
              aria-label={`${wallet.data.balance} Campus Coins`}
            >
              {wallet.data.balance.toLocaleString("en-NG")}{" "}
              <span>{wallet.data.currency.symbol}</span>
            </NavLink>
          )}
          <NotificationBell />
          <span className={styles.playerName}>
            {session?.player?.displayName}
          </span>
          <button
            type="button"
            className={styles.logout}
            onClick={handleLogout}
            disabled={logout.isPending}
            aria-label="Sign out"
          >
            <LuLogOut aria-hidden="true" />
          </button>
        </div>
      </header>

      <main id="main" className={styles.content} tabIndex={-1}>
        <Outlet />
      </main>

      {/* phones: the main places under your thumb, everything else in "More" */}
      <nav aria-label="Main" className={styles.tabbar}>
        {bottom.map((d) => (
          <NavLink
            key={d.key}
            to={d.to}
            className={({ isActive }) => (isActive ? styles.tabOn : styles.tab)}
          >
            <d.icon aria-hidden="true" />
            <span>{d.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={styles.tab}
          aria-haspopup="dialog"
          onClick={() => setMore(true)}
        >
          <LuEllipsis aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {more && (
        <Sheet title="Go to" onClose={() => setMore(false)}>
          <ul className={styles.grid}>
            {[...(enrolled ? [] : [JOURNEY]), ...all].map((d) => (
              <li key={d.key}>
                <NavLink
                  to={d.to}
                  className={
                    isHere(location, d.to) ? styles.tileOn : styles.tile
                  }
                  onClick={() => setMore(false)}
                >
                  <d.icon aria-hidden="true" />
                  <span>{d.label}</span>
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={styles.tile}
                onClick={handleLogout}
              >
                <LuLogOut aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </li>
          </ul>
        </Sheet>
      )}
    </div>
  );
}
