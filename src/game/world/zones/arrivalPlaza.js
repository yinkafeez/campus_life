// "Arrival Plaza" — the first, generic playable zone: a campus quad to learn to move in.
// It is NOT a map of any real campus; real campus zones arrive later as their own files.
// Units are metres. Buildings are boxes (centre x/z, size width/depth/height).

export default {
  key: "arrival-plaza",
  name: "Arrival Plaza",
  description: "A practice quad: find your feet before the real campus opens.",
  size: 80,
  bounds: { minX: -36, maxX: 36, minZ: -36, maxZ: 36 },
  spawn: { x: 0, z: 14, rotY: Math.PI },
  sky: "#9cc8e6",
  ground: "#557d3e",
  water: { z: -33, depth: 30 }, // a lagoon edge beyond the north railing

  buildings: [
    {
      key: "lecture-block",
      x: -18,
      z: -14,
      width: 18,
      depth: 10,
      height: 9,
      color: "#c9b79c",
      roof: "#7a4b3a",
    },
    {
      key: "library",
      x: 18,
      z: -15,
      width: 14,
      depth: 12,
      height: 12,
      color: "#b9c4c9",
      roof: "#3d5a66",
    },
    {
      key: "hostel",
      x: -20,
      z: 16,
      width: 12,
      depth: 10,
      height: 13,
      color: "#d9c7a3",
      roof: "#8a3b2e",
    },
    {
      key: "cafeteria",
      x: 19,
      z: 15,
      width: 13,
      depth: 9,
      height: 6,
      color: "#e4d3b0",
      roof: "#2f6b4f",
    },
    {
      key: "gatehouse",
      x: 0,
      z: 31,
      width: 9,
      depth: 4,
      height: 5,
      color: "#a39279",
      roof: "#5b4636",
    },
  ],

  // walkways (drawn on the ground, no collision)
  paths: [
    { x: 0, z: 0, width: 5, depth: 64 },
    { x: 0, z: 0, width: 56, depth: 5 },
    { x: 0, z: -24, width: 60, depth: 4 },
  ],

  // decorative props with their own collision
  benches: [
    { x: -6, z: 5, rotY: 0 },
    { x: 6, z: 5, rotY: 0 },
    { x: -6, z: -5, rotY: Math.PI },
    { x: 6, z: -5, rotY: Math.PI },
  ],
  lamps: [
    { x: -3.5, z: 10 },
    { x: 3.5, z: 10 },
    { x: -3.5, z: -10 },
    { x: 3.5, z: -10 },
    { x: -14, z: -3.5 },
    { x: 14, z: -3.5 },
  ],

  // trees are scattered from a seed, avoiding paths and buildings
  trees: { seed: 7, count: 70, keepClear: 3 },
  fountain: { x: 0, z: 0, radius: 2.4 },
};
