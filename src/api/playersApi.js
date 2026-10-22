import { api } from "./client";

export function updateMyPlayer(changes) {
  return api.patch("/players/me", changes);
}
