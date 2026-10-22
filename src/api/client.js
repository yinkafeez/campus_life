// fetch wrapper for the Campus Life API (no axios — fetch + React Query everywhere).

// Origin of the API, no trailing slash. Empty in development: Vite proxies /api to the backend.
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

export const API_BASE_URL = `${API_ORIGIN}/api/v1`;

// Render's free tier can take a while to wake up — long, but never infinite
const TIMEOUT_MS = 30_000;

/** Every failed request rejects with this: clients branch on `code`, never on text. */
export class ApiError extends Error {
  constructor(message, { status, code, details, requestId } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

// combine the caller's signal (React Query cancels stale queries) with our timeout
function withTimeout(signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  if (!signal) return timeout;
  return AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal;
}

// requests where a 401 is the real answer, not an expired access token
const NO_REFRESH = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
];

let refreshing = null;

/**
 * Swap the refresh cookie for a new access cookie. Concurrent callers share one request.
 * Resolves true when the session is alive again.
 */
export function refreshSession() {
  refreshing ??= fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then(async (res) => {
      if (res.ok) return true;
      // another tab refreshed a moment ago: its new cookies already apply to us
      const payload = await res.json().catch(() => null);
      return payload?.error?.code === "REFRESH_RACE";
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

let onSessionLost = null;

/** The app registers a callback for "signed out by the server" (session expired/revoked). */
export function setSessionLostHandler(handler) {
  onSessionLost = handler;
}

/**
 * Call the API and resolve straight to the envelope's `data`
 * ({ status: 'success', data } → data; 204 → undefined).
 * A 401 on a protected call triggers one silent session refresh + retry.
 */
export async function request(
  path,
  { method = "GET", body, signal, headers } = {},
  { retried = false } = {},
) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      // send/receive the httpOnly auth cookies
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: withTimeout(signal),
    });
  } catch (err) {
    // the caller cancelled (e.g. component unmounted): let React Query handle it
    if (err.name === "AbortError" && signal?.aborted) throw err;
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    throw new ApiError(
      timedOut ? "The server took too long to respond." : "Network error.",
      {
        status: 0,
        code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
      },
    );
  }

  if (res.status === 401 && !retried && !NO_REFRESH.includes(path)) {
    if (await refreshSession()) {
      return request(
        path,
        { method, body, signal, headers },
        { retried: true },
      );
    }
    onSessionLost?.();
  }

  if (res.status === 204) return undefined;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      payload?.error?.message ?? res.statusText ?? "Request failed",
      {
        status: res.status,
        code: payload?.error?.code ?? "HTTP_ERROR",
        details: payload?.error?.details,
        requestId:
          payload?.requestId ?? res.headers.get("X-Request-Id") ?? undefined,
      },
    );
  }

  return payload?.data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) =>
    request(path, { ...options, method: "POST", body }),
  put: (path, body, options) =>
    request(path, { ...options, method: "PUT", body }),
  patch: (path, body, options) =>
    request(path, { ...options, method: "PATCH", body }),
  // a DELETE may carry a body (e.g. the password to confirm an account deletion)
  delete: (path, body, options) =>
    request(path, { ...options, method: "DELETE", body }),
};
