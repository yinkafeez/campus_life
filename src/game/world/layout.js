import { boxFrom } from "../physics/collide";
import { propColliders } from "../props";

// deterministic randomness: a zone's trees are the same on every visit and every device
export function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const insideBox = (x, z, b) =>
  x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;

/**
 * Turn zone data into what the scene and the collision code need:
 * tree positions + every collider (buildings, benches, lamps, trees, fountain).
 */
export function buildZoneLayout(zone) {
  // buildings and solid props (the gate monument, parked cabs…) both block movement
  const buildingBoxes = [...zone.buildings, ...propColliders(zone.props)].map(
    (b) => boxFrom(b),
  );
  const keepClear = zone.trees.keepClear;
  const blocked = [
    ...buildingBoxes.map((b) => ({
      minX: b.minX - keepClear,
      maxX: b.maxX + keepClear,
      minZ: b.minZ - keepClear,
      maxZ: b.maxZ + keepClear,
    })),
    ...zone.paths.map((p) => boxFrom(p, 1.5)),
    ...(zone.roads ?? []).map((r) => boxFrom(r, 1.5)),
  ];

  const rand = seeded(zone.trees.seed);
  const trees = [];
  for (
    let i = 0;
    trees.length < zone.trees.count && i < zone.trees.count * 20;
    i += 1
  ) {
    const x =
      zone.bounds.minX + 2 + rand() * (zone.bounds.maxX - zone.bounds.minX - 4);
    const z =
      zone.bounds.minZ + 5 + rand() * (zone.bounds.maxZ - zone.bounds.minZ - 7);
    const scale = 0.8 + rand() * 0.7;
    if (blocked.some((b) => insideBox(x, z, b))) continue;
    if (Math.hypot(x - zone.spawn.x, z - zone.spawn.z) < 4) continue;
    trees.push({ x, z, scale });
  }

  const benchBoxes = zone.benches.map((b) =>
    Math.abs(Math.sin(b.rotY)) > 0.5
      ? boxFrom({ x: b.x, z: b.z, width: 0.6, depth: 1.8 })
      : boxFrom({ x: b.x, z: b.z, width: 1.8, depth: 0.6 }),
  );

  return {
    trees,
    colliders: {
      boxes: [...buildingBoxes, ...benchBoxes],
      circles: [
        ...trees.map((t) => ({ x: t.x, z: t.z, r: 0.35 * t.scale })),
        ...zone.lamps.map((l) => ({ x: l.x, z: l.z, r: 0.18 })),
        ...(zone.fountain
          ? [
              {
                x: zone.fountain.x,
                z: zone.fountain.z,
                r: zone.fountain.radius,
              },
            ]
          : []),
      ],
      bounds: zone.bounds,
    },
  };
}
