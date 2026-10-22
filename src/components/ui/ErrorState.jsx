import { LuRefreshCw } from "react-icons/lu";
import { getErrorMessage } from "../../lib/errorMessages";
import Button from "./Button";
import styles from "./ErrorState.module.css";

/**
 * A failed load: a friendly message (never raw server text), a retry button and,
 * optionally, a way out. Use for queries; mutations show their error inline.
 */
export default function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this",
  children,
}) {
  return (
    <div className={styles.box} role="alert">
      <p className={styles.title}>{title}</p>
      <p className={styles.text}>{getErrorMessage(error)}</p>
      <div className={styles.actions}>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={() => onRetry()}>
            <LuRefreshCw aria-hidden="true" /> Try again
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
