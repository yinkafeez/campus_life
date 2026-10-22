import styles from "./LevelTrack.module.css";

// 100L → 200L → … with the current level highlighted.
export default function LevelTrack({ levels }) {
  return (
    <ol className={styles.track}>
      {levels.map((el) => (
        <li
          key={el.level}
          className={styles[el.state]}
          aria-current={el.state === "current" ? "step" : undefined}
        >
          <span className={styles.bar} aria-hidden="true" />
          <span className={styles.label}>{el.label}</span>
        </li>
      ))}
    </ol>
  );
}
