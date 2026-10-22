import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import CharacterModel from "../character/CharacterModel";
import { materialFor } from "../character/materials";
import { readMoveInput } from "../input/useInputStore";
import { resolveCollisions } from "../physics/collide";
import {
  RUN_SPEED,
  TURN_SPEED,
  WALK_SPEED,
  facingFor,
  turnTowards,
  velocityFromInput,
} from "./movement";

const PLAYER_RADIUS = 0.35;
const CAMERA = {
  minDistance: 3,
  maxDistance: 11,
  minPitch: 0.12,
  maxPitch: 1.2,
};

/**
 * Third-person controller: keyboard/joystick input → camera-relative velocity → collision
 * → position. stateRef.current = { x, z, rotY } is shared with the page (position saving).
 */
export default function PlayerController({
  character,
  catalogue,
  colliders,
  stateRef,
}) {
  const { camera, gl } = useThree();
  const body = useRef();
  const motion = useRef({ speed: 0 });
  const orbit = useRef({
    yaw: null, // set on the first frame: behind the player's saved facing
    pitch: 0.42,
    distance: 6,
  });
  const target = useRef(new Vector3());

  // drag to orbit the camera, wheel / pinch to zoom
  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map();
    let pinch = null;

    function down(e) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
    }
    function move(e) {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoom((pinch - dist) * 0.02);
        pinch = dist;
        return;
      }
      const o = orbit.current;
      o.yaw -= (e.clientX - prev.x) * 0.006;
      o.pitch = Math.min(
        CAMERA.maxPitch,
        Math.max(CAMERA.minPitch, o.pitch + (e.clientY - prev.y) * 0.004),
      );
    }
    function up(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
    }
    function zoom(amount) {
      const o = orbit.current;
      o.distance = Math.min(
        CAMERA.maxDistance,
        Math.max(CAMERA.minDistance, o.distance + amount),
      );
    }
    function wheel(e) {
      e.preventDefault();
      zoom(e.deltaY * 0.005);
    }

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05); // a long frame (tab switch) must not teleport the player
    if (orbit.current.yaw === null)
      orbit.current.yaw = stateRef.current.rotY + Math.PI;
    const state = stateRef.current;
    const input = readMoveInput();
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    const v = velocityFromInput(input, orbit.current.yaw, speed);
    const moving = v.x !== 0 || v.z !== 0;

    if (moving) {
      const next = resolveCollisions(
        state.x + v.x * delta,
        state.z + v.z * delta,
        PLAYER_RADIUS,
        colliders,
      );
      state.x = next.x;
      state.z = next.z;
      state.rotY = turnTowards(
        state.rotY,
        facingFor(v.x, v.z),
        TURN_SPEED * delta,
      );
    }
    motion.current.speed = moving ? Math.hypot(v.x, v.z) : 0;

    body.current.position.set(state.x, 0, state.z);
    body.current.rotation.y = state.rotY;

    // camera: behind the player at (yaw, pitch, distance), smoothly following
    const o = orbit.current;
    target.current.set(state.x, 1.45, state.z);
    const desired = new Vector3(
      state.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.distance,
      1.45 + Math.sin(o.pitch) * o.distance,
      state.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.distance,
    );
    camera.position.lerp(desired, 1 - Math.exp(-10 * delta));
    camera.lookAt(target.current);
  });

  return (
    <group ref={body}>
      <CharacterModel
        appearance={character.appearance}
        equipped={character.equipped}
        catalogue={catalogue}
        motionRef={motion}
      />
      {/* soft blob shadow (cheaper than real-time shadow maps on phones) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        material={materialFor("#000000", { opacity: 0.28 })}
      >
        <circleGeometry args={[0.42, 20]} />
      </mesh>
    </group>
  );
}
