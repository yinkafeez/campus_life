/*
 * Frame statistics for the performance overlay (P key or ?perf=1). PerfProbe (inside the
 * Canvas) writes into a plain object every half second — no React re-renders.
 */
export const perfStats = {
  fps: 0,
  frameMs: 0,
  worstMs: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  remotes: 0,
  dpr: 1,
};
