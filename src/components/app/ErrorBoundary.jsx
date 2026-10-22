import { Component } from "react";
import { reportError } from "../../lib/errorReporting";
import styles from "./ErrorBoundary.module.css";

/**
 * Last line of defence: a screen that crashed while rendering shows a friendly way back
 * (reload / go home) instead of a blank page, and the crash is reported (anonymously).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    reportError(error, "render");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={styles.screen} role="alert">
        <div className={styles.box}>
          <h1 className={styles.title}>Something went wrong</h1>
          <p className={styles.text}>
            This screen hit a problem and was stopped. Your saved progress is
            safe on the server. We’ve been told about it.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <a className={styles.secondary} href="/">
              Back to the game
            </a>
          </div>
        </div>
      </div>
    );
  }
}
