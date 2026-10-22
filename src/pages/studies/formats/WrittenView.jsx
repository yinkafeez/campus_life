import { countWords } from "./words";
import styles from "./Formats.module.css";

// value = { text }
export default function WrittenView({ view, value, onChange, disabled }) {
  const text = value?.text ?? "";
  const words = countWords(text);
  const inRange = words >= view.minWords && words <= view.maxWords;

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>{view.prompt}</p>
      <div className={styles.rubric}>
        <p className={styles.rubricTitle}>What earns points</p>
        <ul>
          {view.criteria.map((c) => (
            <li key={c.id}>
              {c.label} <span className={styles.muted}>({c.points} pts)</span>
            </li>
          ))}
        </ul>
        <p className={styles.muted}>
          The game checks for key ideas automatically — it can't judge style or
          quality.
        </p>
      </div>
      <textarea
        className={styles.textarea}
        value={text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={9}
        maxLength={6000}
        disabled={disabled}
        aria-label="Your response"
      />
      <p className={inRange ? styles.muted : styles.warn}>
        {words} words · write {view.minWords}–{view.maxWords}
      </p>
    </div>
  );
}
