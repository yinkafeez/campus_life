import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LuChevronDown,
  LuChevronUp,
  LuNavigation,
  LuTarget,
} from "react-icons/lu";
import styles from "./JourneyHud.module.css";

/**
 * The current fresher objective, pinned to the corner of the 3D world:
 * "Orientation 2/5 — Visit the University Library  [Guide me]". Collapsible, so it
 * never covers the game; steps complete by themselves when you arrive.
 */
export default function JourneyHud({
  objective,
  placeNames,
  guiding,
  onGuide,
}) {
  const [open, setOpen] = useState(true);
  if (!objective) return null;
  const { title, done, total, step } = objective;
  const place = step?.place;
  const where = place ? (placeNames.get(place) ?? null) : null;

  return (
    <aside
      className={styles.hud}
      aria-label="Current objective"
      aria-live="polite"
    >
      <button
        type="button"
        className={styles.head}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <LuTarget aria-hidden="true" className={styles.icon} />
        <span className={styles.title}>
          {title} · {done}/{total}
        </span>
        {open ? (
          <LuChevronUp aria-hidden="true" />
        ) : (
          <LuChevronDown aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className={styles.body}>
          <span
            className={styles.bar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label={`${done} of ${total} done`}
          >
            <span style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
          </span>
          {step ? (
            <>
              <p className={styles.step}>{step.label}</p>
              {where && (
                <p className={styles.where}>
                  📍 {where} — it ticks itself when you arrive
                </p>
              )}
              {place && where && !guiding && (
                <button
                  type="button"
                  className={styles.guide}
                  onClick={() => onGuide(place)}
                >
                  <LuNavigation aria-hidden="true" /> Guide me
                </button>
              )}
              {!where && step.kind === "hostel" && (
                <Link to="/admission" className={styles.link}>
                  Choose your hall
                </Link>
              )}
              {!where && step.kind !== "hostel" && (
                <Link to="/studies?tab=missions" className={styles.link}>
                  Do it in Studies
                </Link>
              )}
            </>
          ) : (
            <>
              <p className={styles.step}>Every step done! 🎉</p>
              <Link to="/studies?tab=missions" className={styles.link}>
                See your reward in Studies
              </Link>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
