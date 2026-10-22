// Who is online right now (in-memory, per API instance). The realtime layer writes it;
// REST services read it for "online" badges. Scaling to several instances later means
// moving this to Redis (with @socket.io/redis-adapter).
const online = new Map(); // playerId → { sockets: Set<socketId>, zoneRoom, state }

export function markOnline(playerId, socketId) {
  const entry = online.get(playerId) ?? { sockets: new Set(), zoneRoom: null, state: null };
  entry.sockets.add(socketId);
  online.set(playerId, entry);
  return entry;
}

/** Returns true when the player's last socket went away. */
export function markOffline(playerId, socketId) {
  const entry = online.get(playerId);
  if (!entry) return true;
  entry.sockets.delete(socketId);
  if (entry.sockets.size === 0) {
    online.delete(playerId);
    return true;
  }
  return false;
}

export const isOnline = (playerId) => online.has(String(playerId));
export const presenceOf = (playerId) => online.get(String(playerId)) ?? null;

export function resetPresence() {
  online.clear();
}
