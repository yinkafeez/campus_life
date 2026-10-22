import { useEffect, useState } from "react";
import { perfStats } from "./perfStats";
import styles from "./PerfOverlay.module.css";

// The numbers behind "is it smooth on this phone?" — toggled with P or ?perf=1.
export default function PerfOverlay() {
  const [stats, setStats] = useState(perfStats);
  useEffect(() => {
    const timer = setInterval(() => setStats({ ...perfStats }), 500);
    return () => clearInterval(timer);
  }, []);
  const tone =
    stats.fps >= 50 ? styles.good : stats.fps >= 30 ? styles.ok : styles.bad;
  return (
    <aside className={styles.overlay} aria-label="Performance">
      <p className={tone}>
        {stats.fps} fps · {stats.frameMs} ms
      </p>
      <p>worst frame {stats.worstMs} ms</p>
      <p>
        {stats.calls} draw calls · {Math.round(stats.triangles / 1000)}k tris
      </p>
      <p>
        {stats.geometries} geometries · {stats.textures} textures
      </p>
      <p>
        {stats.remotes} players in view · {stats.dpr}x
      </p>
    </aside>
  );
}
