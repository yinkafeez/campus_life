// ZONE REGISTRY — every playable zone, loaded on demand (each zone is its own chunk).
// Add a zone: create a data file next to this one and register it here. Which zones a
// university uses (and where players start) comes from its world config (/campus/world).
export const ZONES = {
  "arrival-plaza": () => import("./arrivalPlaza"),
  "unilag-main-gate": () => import("./unilagMainGate"),
  "unilag-senate-lagoon": () => import("./unilagSenateLagoon"),
};

export const DEFAULT_ZONE = "arrival-plaza";

export const hasZone = (key) => Boolean(key && ZONES[key]);

/** The zone to open: where the player left off, else the university's start zone, else the default. */
export function pickZone({ lastZone, startZone, allowed = [] }) {
  const usable = (key) =>
    hasZone(key) && (key === DEFAULT_ZONE || allowed.includes(key));
  if (usable(lastZone)) return lastZone;
  if (usable(startZone)) return startZone;
  return DEFAULT_ZONE;
}

export async function loadZone(key) {
  const loader = ZONES[key] ?? ZONES[DEFAULT_ZONE];
  return (await loader()).default;
}
