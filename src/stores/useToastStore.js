import { create } from "zustand";

let nextId = 1;

// Short-lived in-game notices ("New place discovered", "Ada sent you a message"...).
export const useToastStore = create((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    const entry = { id, tone: "info", ttl: 4500, ...toast };
    set((s) => ({ toasts: [...s.toasts.slice(-3), entry] }));
    if (entry.ttl) setTimeout(() => get().dismiss(id), entry.ttl);
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((el) => el.id !== id) })),
}));

export const toast = (toastOrText) =>
  useToastStore
    .getState()
    .push(
      typeof toastOrText === "string" ? { text: toastOrText } : toastOrText,
    );
