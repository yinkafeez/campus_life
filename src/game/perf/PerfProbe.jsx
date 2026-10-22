import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { targets } from "../multiplayer/useRemotePlayers";
import { perfStats } from "./perfStats";

// Collects frame statistics for the performance overlay (no React re-renders).
export default function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const accRef = useRef({ frames: 0, time: 0, worst: 0 });

  useFrame((_, delta) => {
    const acc = accRef.current;
    acc.frames += 1;
    acc.time += delta;
    acc.worst = Math.max(acc.worst, delta);
    if (acc.time < 0.5) return;
    const { render, memory } = gl.info;
    Object.assign(perfStats, {
      fps: Math.round(acc.frames / acc.time),
      frameMs: Math.round((acc.time / acc.frames) * 10000) / 10,
      worstMs: Math.round(acc.worst * 10000) / 10,
      calls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      remotes: targets.size,
      dpr: gl.getPixelRatio(),
    });
    acc.frames = 0;
    acc.time = 0;
    acc.worst = 0;
  });
  return null;
}
