import { describe, expect, it } from "vitest";
import {
  buildNavGrid,
  findPath,
  locationAt,
  npcNear,
  pathLength,
  relativeBearing,
} from "./navigation";
import { buildZoneLayout } from "./layout";
import { boxFrom } from "../physics/collide";
import senateLagoon from "./zones/unilagSenateLagoon";

const open = {
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  boxes: [],
  circles: [],
};

describe("findPath", () => {
  it("goes straight across open ground", () => {
    const grid = buildNavGrid(open);
    const path = findPath(grid, { x: -8, z: 0 }, { x: 8, z: 0 });
    expect(path).toHaveLength(2);
    expect(pathLength(path)).toBeCloseTo(16, 1);
  });

  it("walks around a wall instead of through it", () => {
    const wall = {
      ...open,
      boxes: [boxFrom({ x: 0, z: 0, width: 2, depth: 14 })],
    };
    const grid = buildNavGrid(wall);
    const path = findPath(grid, { x: -6, z: 0 }, { x: 6, z: 0 });
    expect(path.length).toBeGreaterThan(2);
    // every waypoint is outside the wall
    path.forEach((p) =>
      expect(Math.abs(p.x) > 1 || Math.abs(p.z) > 7).toBe(true),
    );
    expect(pathLength(path)).toBeGreaterThan(14);
  });

  it("returns null when the goal is sealed off", () => {
    const sealed = {
      ...open,
      boxes: [
        boxFrom({ x: 5, z: 0, width: 0.5, depth: 20 }), // full-height wall at x=5
      ],
    };
    const grid = buildNavGrid(sealed, { radius: 0.5 });
    expect(findPath(grid, { x: -5, z: 0 }, { x: 8, z: 0 })).toBeNull();
  });

  it("finds a route between every placed UNILAG destination", () => {
    const layout = buildZoneLayout(senateLagoon);
    const grid = buildNavGrid(layout.colliders);
    const targets = [
      { x: 22, z: 18 }, // 2001 Cafeteria
      { x: -22, z: 18 }, // Library
      { x: -4, z: -38 }, // Lagoon Front
      { x: 24, z: -30 }, // Mad House
      { x: -24, z: -6 }, // Auditorium
    ];
    targets.forEach((t) =>
      expect(findPath(grid, senateLagoon.spawn, t)).not.toBeNull(),
    );
  });
});

describe("proximity", () => {
  const locations = [
    { slug: "a", world: { x: 0, z: 0, radius: 5 } },
    { slug: "b", world: { x: 6, z: 0, radius: 5 } },
    { slug: "unplaced", world: null },
  ];

  it("picks the closest location whose radius you are in", () => {
    expect(locationAt(locations, { x: 2, z: 0 }).slug).toBe("a");
    expect(locationAt(locations, { x: 4, z: 0 }).slug).toBe("b");
    expect(locationAt(locations, { x: 20, z: 0 })).toBeNull();
  });

  it("finds an NPC within reach", () => {
    const npcs = [{ key: "tobi", x: 1, z: 1 }];
    expect(npcNear(npcs, { x: 0, z: 0 }).key).toBe("tobi");
    expect(npcNear(npcs, { x: 9, z: 9 })).toBeNull();
  });

  it("gives a bearing relative to the way the player faces", () => {
    // facing +Z (rotY 0): something ahead is 0, something on +X is ±90°
    expect(
      relativeBearing({ x: 0, z: 0, rotY: 0 }, { x: 0, z: 10 }),
    ).toBeCloseTo(0);
    expect(
      Math.abs(relativeBearing({ x: 0, z: 0, rotY: 0 }, { x: 10, z: 0 })),
    ).toBeCloseTo(Math.PI / 2);
    expect(
      Math.abs(relativeBearing({ x: 0, z: 0, rotY: 0 }, { x: 0, z: -10 })),
    ).toBeCloseTo(Math.PI);
  });
});
