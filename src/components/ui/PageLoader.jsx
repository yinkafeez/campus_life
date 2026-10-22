import styles from "./PageLoader.module.css";

// Suspense fallback while a lazy page loads.
export default function PageLoader({ label = "Loading…" }) {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
