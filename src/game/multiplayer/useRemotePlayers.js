import { create } from "zustand";

/*
 * Other players in my zone.
 *  - `players` (React state): who is here and how they look — changes on join/leave only
 *  - `targets` (plain Map): their latest positions, updated many times a second WITHOUT
 *    re-rendering; the 3D avatars read it every frame and glide towards it
 */
export const targets = new Map(); // playerId → { x, z, rotY, anim }
export const emotes = new Map(); // playerId → { emote, at } — shown above the avatar briefly

export const useRemotePlayers = create((set) => ({
  players: {},
  chat: [], // zone chat lines (newest last)
  setAll: (list) => {
    targets.clear();
    list.forEach((p) =>
      targets.set(p.playerId, {
        x: p.x,
        z: p.z,
        rotY: p.rotY ?? 0,
        anim: p.anim ?? "idle",
      }),
    );
    set({
      players: Object.fromEntries(list.map((p) => [p.playerId, strip(p)])),
    });
  },
  upsert: (p) => {
    targets.set(p.playerId, {
      x: p.x,
      z: p.z,
      rotY: p.rotY ?? 0,
      anim: p.anim ?? "idle",
    });
    set((s) => ({ players: { ...s.players, [p.playerId]: strip(p) } }));
  },
  remove: (playerId) => {
    targets.delete(playerId);
    set((s) => {
      const players = { ...s.players };
      delete players[playerId];
      return { players };
    });
  },
  // a line can arrive twice after a reconnect — keep one
  addChat: (line) =>
    set((s) =>
      s.chat.some((el) => el.id === line.id)
        ? s
        : { chat: [...s.chat.slice(-59), line] },
    ),
  clear: () => {
    targets.clear();
    emotes.clear();
    set({ players: {}, chat: [] });
  },
}));

const strip = ({ playerId, username, displayName, look }) => ({
  playerId,
  username,
  displayName,
  look,
});

export function moveRemote({ playerId, x, z, rotY, anim }) {
  const t = targets.get(playerId);
  if (t) Object.assign(t, { x, z, rotY: rotY ?? t.rotY, anim: anim ?? t.anim });
}
