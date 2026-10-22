import { reportClientError } from "../api/accountApi";

/*
 * Crash reports → the API logs (POST /client-errors). Anonymous and small: the error message,
 * a trimmed stack, the route without its query string, the release. At most a few per visit,
 * each distinct message once, and never during tests.
 */
const MAX_PER_VISIT = 5;
const sent = new Set();
const RELEASE = (import.meta.env.VITE_RELEASE ?? "dev").slice(0, 40);

export function reportError(error, kind = "error") {
  if (import.meta.env.MODE === "test") return;
  const message = String(error?.message ?? error ?? "Unknown error").slice(
    0,
    500,
  );
  if (sent.size >= MAX_PER_VISIT || sent.has(message)) return;
  sent.add(message);
  reportClientError({
    kind,
    message,
    stack:
      typeof error?.stack === "string" ? error.stack.slice(0, 4000) : undefined,
    route: window.location.pathname.slice(0, 200),
    release: RELEASE,
    userAgent: navigator.userAgent.slice(0, 300),
  }).catch(() => {}); // reporting must never cause another error
}

/** Catch what React can't: errors in event handlers, timers and promises. */
export function installErrorReporting() {
  window.addEventListener("error", (e) => reportError(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) =>
    reportError(e.reason, "unhandledrejection"),
  );
}
