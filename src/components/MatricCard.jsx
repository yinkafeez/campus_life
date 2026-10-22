import styles from "./MatricCard.module.css";

// The player's in-game student ID card. Clearly marked as a fictional game card.
export default function MatricCard({ student }) {
  return (
    <div className={styles.card} aria-label="Game student ID card">
      <div className={styles.top}>
        <span className={styles.school}>{student.university.shortName}</span>
        <span className={styles.tag}>Game ID · not official</span>
      </div>

      <p className={styles.label}>{student.matric?.label ?? "Matric number"}</p>
      <p className={styles.number}>{student.matric?.number ?? "Pending"}</p>

      <dl className={styles.meta}>
        <div>
          <dt>Programme</dt>
          <dd>
            {student.programme.award} {student.programme.name}
          </dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{student.currentLevel.label}</dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{student.session?.name ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
