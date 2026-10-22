import { Link } from "react-router-dom";
import styles from "./Button.module.css";

// One button for the whole app.
// variant: primary | secondary | ghost — pass `to` to render a router Link instead.
export default function Button({
  variant = "primary",
  size = "md",
  to,
  loading = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </button>
  );
}
