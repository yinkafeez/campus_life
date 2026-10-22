import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// storage can be blocked (private mode, embedded previews) — the game then just
// keeps the defaults for this visit
const safeStorage = createJSONStorage(() => ({
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
}));

export const GRAPHICS = {
  auto: { label: "Auto", hint: "Adapts to your device (recommended)" },
  saver: {
    label: "Battery saver",
    hint: "Lower resolution, smoother on phones",
  },
  high: { label: "High", hint: "Sharper picture, needs a strong device" },
};

/** This device's game preferences (not synced to the account). */
export const useSettingsStore = create(
  persist(
    (set) => ({
      graphics: "auto",
      nameTags: true,
      briefingSeen: false,
      set: (changes) => set(changes),
    }),
    { name: "campus-life:settings", storage: safeStorage, version: 1 },
  ),
);
