import { lazy, Suspense } from "react";
import { Outlet } from "react-router-dom";
import PageLoader from "../components/ui/PageLoader";
import styles from "./GameShell.module.css";

// three.js is heavy: load the 3D scene in its own chunk, after the UI is on screen
const CampusBackdrop = lazy(() => import("../game/backdrop/CampusBackdrop"));

// Root of every game screen: the 3D scene stays mounted while screens change on top of it.
export default function GameShell() {
  return (
    <div className={styles.shell}>
      <Suspense
        fallback={<div className={styles.fallback} aria-hidden="true" />}
      >
        <CampusBackdrop />
      </Suspense>
      <div className={styles.layer}>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
