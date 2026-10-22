import { useEffect, useState } from "react";
import { LuArrowUp, LuX } from "react-icons/lu";
import { pathLength, relativeBearing } from "../../game/world/navigation";
import styles from "./WayfindingHud.module.css";

// "Heading to 2001 Cafeteria — 42 m" with an arrow towards the next turn of the route.
export default function WayfindingHud({ name, route, stateRef, onStop }) {
  const [view, setView] = useState({ angle: 0, metres: null });

  useEffect(() => {
    const tick = () => {
      const s = stateRef.current;
      if (!s || !route || route.length < 2) return;
      // aim at the first waypoint more than 2 m away
      const next =
        route.find((p, i) => i > 0 && Math.hypot(p.x - s.x, p.z - s.z) > 2) ??
        route[route.length - 1];
      setView({
        angle: relativeBearing(s, next),
        metres: Math.round(pathLength([{ x: s.x, z: s.z }, ...route.slice(1)])),
      });
    };
    tick();
    const timer = setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [route, stateRef]);

  return (
    <div className={styles.hud} role="status">
      <span
        className={styles.arrow}
        style={{ transform: `rotate(${(view.angle * 180) / Math.PI}deg)` }}
        aria-hidden="true"
      >
        <LuArrowUp />
      </span>
      <div className={styles.text}>
        <p className={styles.label}>Heading to</p>
        <p className={styles.name}>
          {name}
          {view.metres !== null && (
            <span className={styles.metres}> · {view.metres} m</span>
          )}
        </p>
      </div>
      <button
        type="button"
        className={styles.stop}
        onClick={onStop}
        aria-label="Stop guiding"
      >
        <LuX aria-hidden="true" />
      </button>
    </div>
  );
}
