import { LuX } from "react-icons/lu";
import { useToastStore } from "../../stores/useToastStore";
import styles from "./ToastStack.module.css";

// Floating notices (top centre), above both the 3D world and in-game screens.
export default function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (!toasts.length) return null;

  return (
    <div className={styles.stack} aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${styles[t.tone] ?? ""}`}
          role="status"
        >
          {t.title && <p className={styles.title}>{t.title}</p>}
          <p className={styles.text}>{t.text}</p>
          <button
            type="button"
            className={styles.close}
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <LuX aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
