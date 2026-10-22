import styles from "./Field.module.css";

// Label + control + hint/error, wired up for screen readers.
export default function Field({ label, htmlFor, error, hint, children }) {
  const describedBy = error
    ? `${htmlFor}-error`
    : hint
      ? `${htmlFor}-hint`
      : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor} className={styles.label}>
        {label}
      </label>
      {typeof children === "function" ? children({ describedBy }) : children}
      {error ? (
        <p id={`${htmlFor}-error`} className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

// Text input styled for the game UI (React 19: ref arrives as a normal prop).
export function TextInput({ invalid = false, className = "", ...props }) {
  return (
    <input
      className={`${styles.input} ${invalid ? styles.invalid : ""} ${className}`}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function SelectInput({
  invalid = false,
  className = "",
  children,
  ...props
}) {
  return (
    <select
      className={`${styles.input} ${styles.select} ${invalid ? styles.invalid : ""} ${className}`}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  );
}
