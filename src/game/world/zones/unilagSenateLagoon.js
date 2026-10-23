// "Senate & Lagoon Front" — the first UNILAG zone (Akoka).
// A STYLISED, COMPRESSED layout made for play: landmarks are placed so a fresher can find
// them, NOT surveyed positions or real building footprints. No map imagery was used.
// Locations (names, activities, NPCs, where each marker sits) come from the university's
// records via /campus/world; this file only draws the scenery around them, and buildings
// name the location slug they stand for.
// Units are metres; buildings are boxes (centre x/z, size width/depth/height).

export default {
  key: "unilag-senate-lagoon",
  name: "UNILAG · Senate & Lagoon Front",
  description:
    "From the campus shuttle stop up to Senate House and the lagoon.",
  notToScale: true,
  bounds: { minX: -44, maxX: 44, minZ: -42, maxZ: 46 },
  spawn: { x: 0, z: 34, rotY: Math.PI },
  // coming up University Road from the Main Gate
  entries: { "unilag-main-gate": { x: 0, z: 40, rotY: Math.PI } },
  exits: [
    {
      to: "unilag-main-gate",
      x: 0,
      z: 45,
      radius: 3,
      label: "Walk back to the Main Gate",
    },
  ],
  sky: "#a8d2ec",
  ground: "#5b8a43",
  water: { z: -43, depth: 50 }, // the lagoon beyond the waterfront railing

  buildings: [
    {
      key: "senate-house",
      location: "senate-house",
      x: 0,
      z: -17,
      width: 12,
      depth: 9,
      height: 34, // the tall tower everyone uses as a landmark
      color: "#e7e1d3",
      roof: "#6b7280",
    },
    {
      key: "senate-wing",
      x: 0,
      z: -17,
      width: 24,
      depth: 6,
      height: 7,
      color: "#d8d1c0",
      roof: "#6b7280",
    },
    {
      key: "auditorium",
      location: "jf-ade-ajayi-auditorium",
      x: -32,
      z: -6,
      width: 13,
      depth: 17,
      height: 11,
      color: "#cdb8a0",
      roof: "#7a4b3a",
    },
    {
      key: "library",
      location: "university-library",
      x: -31,
      z: 19,
      width: 13,
      depth: 14,
      height: 13,
      color: "#b9c4c9",
      roof: "#3d5a66",
    },
    {
      key: "cafeteria",
      location: "2001-cafeteria",
      x: 31,
      z: 19,
      width: 13,
      depth: 10,
      height: 6,
      color: "#efe0bf",
      roof: "#2f6b4f",
    },
    {
      key: "mad-house",
      location: "mad-house",
      x: 32,
      z: -31,
      width: 9,
      depth: 9,
      height: 6,
      color: "#d1c4e9",
      roof: "#4c1d95",
    },
    {
      key: "bus-shelter",
      location: "campus-bus-service",
      x: 7,
      z: 41,
      width: 7,
      depth: 2.4,
      height: 3,
      color: "#9ca3af",
      roof: "#1f2937",
    },
  ],

  // name boards (they face along rotY; 0 = facing +Z)
  signs: [
    { text: "Senate House", x: 0, z: -12, rotY: 0 },
    { text: "J.F. Ade Ajayi Auditorium", x: -23.5, z: -1, rotY: Math.PI / 2 },
    { text: "University Library", x: -23, z: 22, rotY: Math.PI / 2 },
    { text: "2001 Cafeteria", x: 23, z: 13, rotY: -Math.PI / 2 },
    { text: "Mad House", x: 26, z: -25.5, rotY: -Math.PI / 2 },
    { text: "Campus Shuttle", x: 3, z: 38.5, rotY: Math.PI },
    { text: "Sofoluwe Park", x: 11, z: -1.5, rotY: -Math.PI / 2 },
    { text: "Lagoon Front", x: -8, z: -33.5, rotY: 0 },
  ],

  // walkways (drawn on the ground, no collision)
  paths: [
    { x: 0, z: 17.5, width: 6, depth: 53 }, // main avenue: shuttle stop → Senate House
    { x: -15, z: -22, width: 4, depth: 30 }, // round the Senate wing down to the lagoon
    { x: 0, z: -6, width: 58, depth: 5 }, // auditorium ↔ park
    { x: 0, z: 18, width: 58, depth: 5 }, // library ↔ cafeteria
    { x: -2, z: -37, width: 46, depth: 6 }, // waterfront promenade
    { x: 22, z: -30, width: 4, depth: 16 }, // to Mad House
  ],

  benches: [
    { x: 14, z: -1, rotY: 0 },
    { x: 19, z: -1, rotY: 0 },
    { x: 14, z: -11, rotY: Math.PI },
    { x: 19, z: -11, rotY: Math.PI },
    { x: -10, z: -35, rotY: Math.PI },
    { x: 2, z: -35, rotY: Math.PI },
    { x: 19.5, z: 25.5, rotY: 0 },
    { x: 22.5, z: 25.5, rotY: 0 },
  ],
  lamps: [
    { x: -4, z: 30 },
    { x: 4, z: 30 },
    { x: -4, z: 10 },
    { x: 4, z: 10 },
    { x: -4, z: -26 },
    { x: 4, z: -26 },
    { x: -18, z: -36 },
    { x: 14, z: -36 },
    { x: -16, z: 21 },
    { x: 16, z: 21 },
  ],

  trees: { seed: 23, count: 90, keepClear: 3 },
  // Sofoluwe Park: a stand of palms-ish trees around the benches (kept free of the paths)
  fountain: null,
};
