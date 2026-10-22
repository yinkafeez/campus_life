import { useEffect } from "react";
import { useInputStore } from "./useInputStore";

const KEY_MAP = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

/** WASD / arrow keys to move, Shift to run. Ignores typing in form fields. */
export default function useKeyboardControls() {
  useEffect(() => {
    const { setKey, setRun, reset } = useInputStore.getState();

    function onKey(e) {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, select")
      )
        return;
      const down = e.type === "keydown";
      if (e.key === "Shift") setRun(down);
      const name = KEY_MAP[e.code];
      if (name) {
        setKey(name, down);
        e.preventDefault(); // arrows must not scroll the page
      }
    }
    // releasing keys while the window is in the background would leave them "stuck"
    const onBlur = () => reset();

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
      reset();
    };
  }, []);
}
