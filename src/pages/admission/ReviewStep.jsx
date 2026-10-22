import { useEffect, useState } from "react";
import Panel from "../../components/ui/Panel";
import styles from "./ReviewStep.module.css";

// Simulated review in progress. The server owns the timer; this only counts down to it
// (useMyStudent polls every second while the status is under_review).
export default function ReviewStep({ student }) {
  const decisionAt = new Date(student.admission.reviewCompletesAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const total = Math.max(
    1,
    decisionAt - new Date(student.admission.appliedAt).getTime(),
  );
  const remaining = Math.max(0, decisionAt - now);
  const percent = Math.min(
    100,
    Math.round(((total - remaining) / total) * 100),
  );

  return (
    <Panel className={styles.panel}>
      <div className={styles.seal} aria-hidden="true">
        <span className={styles.ring} style={{ "--progress": `${percent}%` }} />
        <span className={styles.count}>{Math.ceil(remaining / 1000)}</span>
      </div>
      <h1 className={styles.heading}>Your application is under review</h1>
      <p className={styles.text}>
        {student.programme.award} {student.programme.name} ·{" "}
        {student.entryLevel.label} · {student.university.name}
      </p>
      <p className={styles.small} role="status" aria-live="polite">
        {remaining > 0
          ? "The admissions office is reviewing your application…"
          : "Decision ready — loading…"}
      </p>
    </Panel>
  );
}
