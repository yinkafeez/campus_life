import { create } from "zustand";

// Player input, written by the keyboard and the touch joystick, read every frame by the
// controller via getState() (no React re-renders at 60 fps).
export const useInputStore = create((set) => ({
  keys: { forward: 0, back: 0, left: 0, right: 0 },
  stick: { forward: 0, right: 0 }, // touch joystick, -1..1
  run: false,
  setKey: (name, down) =>
    set((s) => ({ keys: { ...s.keys, [name]: down ? 1 : 0 } })),
  setStick: (forward, right) => set({ stick: { forward, right } }),
  setRun: (run) => set({ run }),
  reset: () =>
    set({
      keys: { forward: 0, back: 0, left: 0, right: 0 },
      stick: { forward: 0, right: 0 },
      run: false,
    }),
}));

/** Combined move intent from every input source. */
export function readMoveInput() {
  const { keys, stick, run } = useInputStore.getState();
  return {
    forward: Math.max(
      -1,
      Math.min(1, keys.forward - keys.back + stick.forward),
    ),
    right: Math.max(-1, Math.min(1, keys.right - keys.left + stick.right)),
    run,
  };
}
