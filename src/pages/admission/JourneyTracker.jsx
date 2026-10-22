import { LuCheck } from "react-icons/lu";
import { JOURNEY_STAGES } from "../../lib/journey";
import styles from "./JourneyTracker.module.css";

// Progress through the whole fresher journey (admission → look → matric → orientation → mission).
export default function JourneyTracker({ index = 0 }) {
  return (
    <ol className={styles.track} aria-label="Your fresher journey">
      {JOURNEY_STAGES.map((stage, i) => {
        const state = i < index ? "done" : i === index ? "current" : "todo";
        return (
          <li
            key={stage.key}
            className={styles[state]}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className={styles.dot}>
              {state === "done" ? <LuCheck aria-label="done" /> : i + 1}
            </span>
            <span className={styles.label}>{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
