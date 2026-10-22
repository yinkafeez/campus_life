import { useRef, useState } from "react";
import { useInputStore } from "./useInputStore";
import styles from "./TouchJoystick.module.css";

const RADIUS = 48; // px the knob can travel

// On-screen joystick for touch devices: drag the knob to walk, push it far to run.
export default function TouchJoystick() {
  const base = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  function update(e) {
    const rect = base.current.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    const { setStick, setRun } = useInputStore.getState();
    setStick(-dy / RADIUS, dx / RADIUS);
    setRun(len > RADIUS * 0.95);
  }

  function release() {
    setKnob({ x: 0, y: 0 });
    useInputStore.getState().setStick(0, 0);
    useInputStore.getState().setRun(false);
  }

  return (
    <div
      ref={base}
      className={styles.base}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => e.buttons && update(e)}
      onPointerUp={release}
      onPointerCancel={release}
      role="application"
      aria-label="Movement joystick"
    >
      <span
        className={styles.knob}
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
