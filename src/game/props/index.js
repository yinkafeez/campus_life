import UnilagGate from "./UnilagGate";

// solid parts of the gate set-piece, relative to its origin
const GATE_COLLIDERS = [
  { x: 0, z: 0, width: 7, depth: 4.6 }, // the monument's plinth
  { x: 0, z: -4, width: 5.2, depth: 34 }, // the median island (cross at the gate)
];
import CabTerminal from "./Cab";

/*
 * Set-piece props a zone can place by type: { type, x, z, rotY }. Each entry gives the
 * component and the solid boxes (relative to the prop, unrotated) for collisions.
 */
export const PROPS = {
  "unilag-gate": { Component: UnilagGate, colliders: GATE_COLLIDERS },
  "cab-terminal": {
    Component: CabTerminal,
    colliders: [{ x: 0, z: 0.4, width: 8.6, depth: 4.6 }],
  },
};

/** World-space collider boxes for a zone's props (rotations of 0 / ±90° / 180° only). */
export function propColliders(props = []) {
  return props.flatMap((p) => {
    const def = PROPS[p.type];
    if (!def) return [];
    const quarter = Math.round(((p.rotY ?? 0) / (Math.PI / 2)) % 4);
    const swap = Math.abs(quarter) % 2 === 1;
    return def.colliders.map((c) => {
      const cos = Math.round(Math.cos(p.rotY ?? 0));
      const sin = Math.round(Math.sin(p.rotY ?? 0));
      return {
        x: p.x + c.x * cos + c.z * sin,
        z: p.z - c.x * sin + c.z * cos,
        width: swap ? c.depth : c.width,
        depth: swap ? c.width : c.depth,
      };
    });
  });
}
