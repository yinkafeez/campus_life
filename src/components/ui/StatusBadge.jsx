import styles from "./StatusBadge.module.css";

// Coloured pill for a service state.
// tone: success | warning | danger | neutral
export default function StatusBadge({ tone = "neutral", children }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
