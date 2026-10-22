import { useEffect, useRef } from "react";
import { LuX } from "react-icons/lu";
import styles from "./Sheet.module.css";

/**
 * A panel that slides up from the bottom on phones and floats on larger screens.
 * Accessible dialog: focus moves in, Escape or the backdrop closes it, focus returns.
 * It never pauses the game behind it.
 */
export default function Sheet({ title, onClose, children, side = "bottom" }) {
  const panel = useRef(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement;
    panel.current
      ?.querySelector("a, button, input, select, textarea, [tabindex]")
      ?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (before instanceof HTMLElement) before.focus?.();
    };
  }, []);

  return (
    <div
      className={side === "right" ? styles.backdropRight : styles.backdrop}
      onClick={onClose}
    >
      <section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={side === "right" ? styles.right : styles.bottom}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            <LuX aria-hidden="true" />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
  );
}
