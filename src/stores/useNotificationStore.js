import { create } from "zustand";
import { toast } from "./useToastStore";

let nextId = 1;
const KEEP = 40;

/**
 * The notification centre (bell): everything that popped up as a toast this session,
 * with an optional link, so nothing is lost when a toast disappears mid-game.
 */
export const useNotificationStore = create((set) => ({
  items: [],
  unread: 0,
  add: (item) =>
    set((s) => ({
      items: [{ id: nextId++, at: Date.now(), ...item }, ...s.items].slice(
        0,
        KEEP,
      ),
      unread: s.unread + 1,
    })),
  markRead: () => set({ unread: 0 }),
  clear: () => set({ items: [], unread: 0 }),
}));

/** Show a toast AND keep it in the notification centre. `link` opens the related screen. */
export function notify({ link, ...entry }) {
  useNotificationStore.getState().add({ ...entry, link });
  return toast(entry);
}
