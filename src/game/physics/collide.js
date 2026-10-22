// Lightweight 2D collision for walking on flat ground (no physics engine needed yet).
// The player is a circle on the XZ plane; obstacles are axis-aligned boxes and circles;
// the zone has rectangular bounds. Pure functions → unit-tested.

/** Push a circle (x, z, r) out of an axis-aligned box. Returns the corrected {x, z}. */
export function pushOutOfBox(x, z, r, box) {
  // closest point on the box to the circle centre
  const cx = Math.max(box.minX, Math.min(x, box.maxX));
  const cz = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  const distSq = dx * dx + dz * dz;

  if (distSq > 0) {
    if (distSq >= r * r) return { x, z };
    const dist = Math.sqrt(distSq);
    const push = r - dist;
    return { x: x + (dx / dist) * push, z: z + (dz / dist) * push };
  }

  // centre is inside the box: leave through the nearest side
  const exits = [
    { d: x - box.minX, x: box.minX - r, z },
    { d: box.maxX - x, x: box.maxX + r, z },
    { d: z - box.minZ, x, z: box.minZ - r },
    { d: box.maxZ - z, x, z: box.maxZ + r },
  ];
  const nearest = exits.reduce((a, b) => (b.d < a.d ? b : a));
  return { x: nearest.x, z: nearest.z };
}

/** Push a circle out of another circle (e.g. a tree trunk). */
export function pushOutOfCircle(x, z, r, circle) {
  const dx = x - circle.x;
  const dz = z - circle.z;
  const min = r + circle.r;
  const distSq = dx * dx + dz * dz;
  if (distSq >= min * min) return { x, z };
  const dist = Math.sqrt(distSq) || 0.0001;
  return { x: circle.x + (dx / dist) * min, z: circle.z + (dz / dist) * min };
}

/** Keep the circle inside the zone bounds. */
export function clampToBounds(x, z, r, bounds) {
  return {
    x: Math.max(bounds.minX + r, Math.min(x, bounds.maxX - r)),
    z: Math.max(bounds.minZ + r, Math.min(z, bounds.maxZ - r)),
  };
}

/**
 * Resolve a desired position against everything in the zone. Two passes handle corners
 * where two obstacles touch.
 */
export function resolveCollisions(
  x,
  z,
  r,
  { boxes = [], circles = [], bounds },
) {
  let pos = { x, z };
  for (let pass = 0; pass < 2; pass += 1) {
    for (const box of boxes) pos = pushOutOfBox(pos.x, pos.z, r, box);
    for (const circle of circles)
      pos = pushOutOfCircle(pos.x, pos.z, r, circle);
    if (bounds) pos = clampToBounds(pos.x, pos.z, r, bounds);
  }
  return pos;
}

/** Axis-aligned box from a centre + size (how zones describe buildings). */
export const boxFrom = ({ x, z, width, depth }, padding = 0) => ({
  minX: x - width / 2 - padding,
  maxX: x + width / 2 + padding,
  minZ: z - depth / 2 - padding,
  maxZ: z + depth / 2 + padding,
});
