// "Main Gate" — where every new UNILAG player starts (Akoka entrance, University Road).
// A STYLISED, COMPRESSED layout made for play, modelled on the gate's well-known look and a
// reference photo (twin-wing monument on the median, footbridge, dual carriageway) — NOT
// surveyed positions, real building footprints or map imagery. Not to scale.
// Units are metres; −Z is into campus. The road continues to "Senate & Lagoon Front".

const SENATE = "unilag-senate-lagoon";

export default {
  key: "unilag-main-gate",
  name: "UNILAG · Main Gate",
  description:
    "The Akoka entrance, the cab terminal and University Road into campus.",
  notToScale: true,
  bounds: { minX: -46, maxX: 46, minZ: -62, maxZ: 50 },
  // on the left walkway, just inside the gate, facing up University Road
  spawn: { x: -12.5, z: 36, rotY: Math.PI },
  // arriving back from the Senate end of the road
  entries: { [SENATE]: { x: -13, z: -52, rotY: 0 } },
  // walk to the end of the road to continue (PlayPage offers the trip)
  exits: [
    {
      to: SENATE,
      x: 0,
      z: -57,
      radius: 17,
      label: "Walk on to Senate & Lagoon Front",
    },
  ],
  sky: "#a9d3ee",
  ground: "#5c8b45",
  water: null,

  // the gate monument, median, footbridge and gatehouses; the cab terminal by the road
  props: [
    { type: "unilag-gate", x: 0, z: 30 },
    { type: "cab-terminal", x: 25, z: 10, rotY: -Math.PI / 2 },
  ],

  roads: [
    { x: -6.35, z: -6, width: 7.5, depth: 112 }, // inbound carriageway
    { x: 6.35, z: -6, width: 7.5, depth: 112 }, // outbound carriageway
    { x: 0, z: 46, width: 92, depth: 7 }, // the road outside the gate
    { x: 17.5, z: 10, width: 6, depth: 14 }, // lay-by into the cab terminal
  ],

  buildings: [
    // generic campus blocks lining University Road (not named: positions are not surveyed)
    {
      key: "block-l1",
      x: -30,
      z: 8,
      width: 14,
      depth: 22,
      height: 10,
      color: "#e2d6b8",
      roof: "#7a4b3a",
    },
    {
      key: "block-l2",
      x: -30,
      z: -30,
      width: 14,
      depth: 20,
      height: 13,
      color: "#d9cdb0",
      roof: "#5b6670",
    },
    {
      key: "block-r2",
      x: 31,
      z: -30,
      width: 13,
      depth: 22,
      height: 9,
      color: "#e8c77a",
      roof: "#8a3b2b",
    },
  ],

  signs: [
    { text: "Main Gate", x: -17, z: 30, rotY: Math.PI / 2 },
    { text: "Cab terminal", x: 20.5, z: 18.5, rotY: -Math.PI / 2 },
    { text: "Senate House ↑", x: -17, z: -40, rotY: Math.PI / 2 },
    { text: "Welcome to UNILAG", x: -17, z: 41, rotY: Math.PI / 2 },
  ],

  // walkways on both sides, a crossing at the gate and one by the cab terminal
  paths: [
    { x: -13.6, z: -6, width: 4, depth: 112 },
    { x: 13.6, z: -6, width: 4, depth: 112 },
    { x: 0, z: 21.5, width: 31, depth: 3 },
    { x: 0, z: -2, width: 31, depth: 3 },
  ],

  benches: [
    { x: 16.5, z: 2, rotY: -Math.PI / 2 },
    { x: 16.5, z: 5, rotY: -Math.PI / 2 },
  ],
  lamps: [
    { x: -11.6, z: 40 },
    { x: 11.6, z: 40 },
    { x: -11.6, z: 12 },
    { x: 11.6, z: 12 },
    { x: -11.6, z: -16 },
    { x: 11.6, z: -16 },
    { x: -11.6, z: -44 },
    { x: 11.6, z: -44 },
  ],

  trees: { seed: 7, count: 70, keepClear: 3 },
  fountain: null,
};
