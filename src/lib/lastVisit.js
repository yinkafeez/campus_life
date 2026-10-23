/*
 * LAST VISIT — remembered on this device so a returning player sees where they left off (the
 * start-screen background) and "Continue" takes them straight back:
 *   { path, zone, x, z, rotY, place, name, at }
 * Only game state the player already sees — no tokens or personal data. Storage can be
 * blocked (private mode): every access is guarded and the game simply starts fresh.
 */
const KEY = "campus-life:last-visit";
// screens that are not "where you were"
const NOT_A_PLACE = [
  "/",
  "/login",
  "/register",
  "/resume",
  "/welcome",
  "/privacy",
  "/status",
];

export function readLastVisit() {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function rememberVisit(patch) {
  try {
    const current = readLastVisit() ?? {};
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...current, ...patch, at: Date.now() }),
    );
  } catch {
    // storage unavailable: nothing to remember
  }
}

/** Record the screen a signed-in player is on (ignores the start/auth screens). */
export function rememberPath(path) {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  if (NOT_A_PLACE.includes(path.split("?")[0])) return;
  rememberVisit({ path });
}

export function forgetVisit() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Where "Continue" goes: the remembered screen, or the game decides (admission/dashboard). */
export const resumePathOf = (visit) =>
  visit?.path && visit.path.startsWith("/") && !visit.path.startsWith("//")
    ? visit.path
    : "/resume";
