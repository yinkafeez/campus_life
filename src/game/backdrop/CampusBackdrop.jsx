import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Instance,
  Instances,
  PerformanceMonitor,
  Stars,
} from "@react-three/drei";
import { useSettingsStore } from "../../stores/useSettingsStore";
import styles from "./CampusBackdrop.module.css";

// Stylised dusk campus by a lagoon for the start screen — procedural, no downloads.
// NOT a map of any real campus (the streamed campus world arrives in a later phase).

// deterministic randomness: the skyline is the same on every visit
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDING_COLORS = ["#2a3d35", "#33483e", "#3b4f44", "#4a3b33", "#2f3a46"];
const LAGOON_EDGE = 26; // everything with x > this is water

function useCampusLayout() {
  return useMemo(() => {
    const rand = seeded(2026);
    const buildings = [];
    for (let i = 0; i < 46; i += 1) {
      const x = -60 + rand() * 82;
      const z = -55 + rand() * 100;
      if (Math.hypot(x, z) < 9) continue; // keep the centre clear for the tower
      const w = 4 + rand() * 7;
      const d = 4 + rand() * 7;
      const h = 3 + rand() ** 2 * 16;
      buildings.push({
        position: [Math.min(x, LAGOON_EDGE - w), h / 2, z],
        scale: [w, h, d],
        color: BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)],
        lit: rand() > 0.55,
      });
    }
    const trees = [];
    for (let i = 0; i < 140; i += 1) {
      const x = -70 + rand() * (LAGOON_EDGE + 66);
      const z = -70 + rand() * 140;
      const s = 0.8 + rand() * 0.9;
      trees.push({ position: [x, 0, z], scale: s });
    }
    return { buildings, trees };
  }, []);
}

function Campus() {
  const { buildings, trees } = useCampusLayout();
  const lit = buildings.filter((el) => el.lit);

  return (
    <group>
      {/* ground and lagoon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-20, 0, 0]}>
        <planeGeometry args={[140, 180]} />
        <meshStandardMaterial color="#14281f" roughness={1} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[LAGOON_EDGE + 60, -0.15, 0]}
      >
        <planeGeometry args={[120, 220]} />
        <meshStandardMaterial
          color="#14404d"
          roughness={0.15}
          metalness={0.4}
        />
      </mesh>

      {/* buildings — one draw call */}
      <Instances limit={buildings.length}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.85} />
        {buildings.map((b, i) => (
          <Instance
            key={i}
            position={b.position}
            scale={b.scale}
            color={b.color}
          />
        ))}
      </Instances>

      {/* glowing window bands on some buildings — one draw call */}
      <Instances limit={lit.length}>
        <boxGeometry />
        <meshStandardMaterial
          color="#f5b70a"
          emissive="#f5b70a"
          emissiveIntensity={1.4}
          toneMapped={false}
        />
        {lit.map((b, i) => (
          <Instance
            key={i}
            position={[b.position[0], b.scale[1] * 0.62, b.position[2]]}
            scale={[b.scale[0] * 1.01, 0.35, b.scale[2] * 1.01]}
          />
        ))}
      </Instances>

      {/* landmark tower at the centre */}
      <mesh position={[0, 13, 0]}>
        <boxGeometry args={[5, 26, 5]} />
        <meshStandardMaterial color="#3d5248" roughness={0.7} />
      </mesh>
      <mesh position={[0, 26.4, 0]}>
        <boxGeometry args={[5.2, 0.6, 5.2]} />
        <meshStandardMaterial
          color="#16b46c"
          emissive="#16b46c"
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>

      {/* trees — trunk + crown, two draw calls for all of them */}
      <Instances limit={trees.length}>
        <cylinderGeometry args={[0.15, 0.22, 1.4, 6]} />
        <meshStandardMaterial color="#3a2a1d" />
        {trees.map((t, i) => (
          <Instance
            key={i}
            position={[t.position[0], 0.7 * t.scale, t.position[2]]}
            scale={t.scale}
          />
        ))}
      </Instances>
      <Instances limit={trees.length}>
        <coneGeometry args={[1.3, 3, 7]} />
        <meshStandardMaterial color="#1f5a3b" roughness={0.9} />
        {trees.map((t, i) => (
          <Instance
            key={i}
            position={[t.position[0], 2.6 * t.scale, t.position[2]]}
            scale={t.scale}
          />
        ))}
      </Instances>
    </group>
  );
}

// slow orbit around the tower (frozen when the player prefers reduced motion)
function OrbitCamera({ moving }) {
  const angle = useRef(0.6);
  useFrame(({ camera }, delta) => {
    if (moving) angle.current += delta * 0.035;
    const r = 62;
    camera.position.set(
      Math.cos(angle.current) * r - 8,
      24,
      Math.sin(angle.current) * r,
    );
    camera.lookAt(-4, 6, 0);
  });
  return null;
}

// the orbit is slow (≈2°/s), so ~20 frames a second looks the same as 60 and costs a third:
// menus sit on top of this scene, and phones shouldn't burn battery behind a form
const BACKDROP_FPS = 20;
function Throttle({ fps }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const timer = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(timer);
  }, [invalidate, fps]);
  return null;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function CampusBackdrop() {
  const [dpr, setDpr] = useState(1.25);
  // battery saver or reduced motion → a still picture (rendered on demand only)
  const saver = useSettingsStore((s) => s.graphics === "saver");
  const reduced = prefersReducedMotion() || saver;

  return (
    <div className={styles.backdrop} aria-hidden="true">
      <Canvas
        dpr={dpr}
        frameloop="demand"
        camera={{ fov: 45, near: 0.5, far: 260 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        {/* drop resolution on weak devices, raise it on strong ones */}
        <PerformanceMonitor
          onIncline={() => setDpr(1.5)}
          onDecline={() => setDpr(1)}
          flipflops={3}
          onFallback={() => setDpr(1)}
        />
        <color attach="background" args={["#0b1511"]} />
        <fog attach="fog" args={["#0b1511", 45, 150]} />
        <hemisphereLight args={["#ffd9a8", "#0b1511", 0.55]} />
        <directionalLight
          position={[60, 40, -30]}
          intensity={1.3}
          color="#ffb070"
        />
        <Stars
          radius={160}
          depth={40}
          count={700}
          factor={3}
          fade
          speed={reduced ? 0 : 0.4}
        />
        <Campus />
        <OrbitCamera moving={!reduced} />
        {!reduced && <Throttle fps={BACKDROP_FPS} />}
      </Canvas>
      <div className={styles.vignette} />
    </div>
  );
}
