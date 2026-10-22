import { api } from "./client";

// my campus world: locations placed in zones, NPCs, my discoveries
export function getCampusWorld({ signal } = {}) {
  return api.get("/campus/world", { signal });
}

export function discoverLocation(locationSlug) {
  return api.post("/campus/discoveries", { locationSlug });
}

export function doActivity({ locationSlug, activityKey }) {
  return api.post("/campus/activities", { locationSlug, activityKey });
}
