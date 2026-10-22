import { describe, expect, it } from "vitest";
import {
  boxFrom,
  clampToBounds,
  pushOutOfBox,
  pushOutOfCircle,
  resolveCollisions,
} from "./collide";
import { facingFor, turnTowards, velocityFromInput } from "../player/movement";

const box = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };

describe("collision", () => {
  it("leaves a circle that doesn't touch a box alone", () => {
    expect(pushOutOfBox(-2, 2, 0.4, box)).toEqual({ x: -2, z: 2 });
  });

  it("pushes a circle overlapping a box edge back out", () => {
    const pos = pushOutOfBox(-0.2, 2, 0.4, box);
    expect(pos.x).toBeCloseTo(-0.4);
    expect(pos.z).toBeCloseTo(2);
  });

  it("ejects a circle that ended up inside a box through the nearest side", () => {
    expect(pushOutOfBox(3.8, 2, 0.4, box)).toEqual({ x: 4.4, z: 2 });
  });

  it("pushes out of round obstacles (tree trunks)", () => {
    const pos = pushOutOfCircle(0.3, 0, 0.4, { x: 0, z: 0, r: 0.5 });
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(0.9);
  });

  it("keeps the player inside the zone", () => {
    expect(
      clampToBounds(50, -50, 0.5, { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }),
    ).toEqual({ x: 9.5, z: -9.5 });
  });

  it("resolves against everything at once, including a corner between two boxes", () => {
    const zone = {
      boxes: [
        boxFrom({ x: 0, z: 0, width: 2, depth: 2 }),
        boxFrom({ x: 2, z: 0, width: 2, depth: 2 }),
      ],
      circles: [],
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    };
    const pos = resolveCollisions(1, 0.9, 0.4, zone);
    // ends up outside both boxes
    expect(pos.z).toBeGreaterThanOrEqual(1.4 - 1e-6);
  });
});

describe("movement", () => {
  it("moves away from the camera when pressing forward", () => {
    const v = velocityFromInput({ forward: 1 }, 0, 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(-2);
  });

  it("moves relative to the camera when it has orbited", () => {
    const v = velocityFromInput({ forward: 1 }, Math.PI / 2, 2);
    expect(v.x).toBeCloseTo(-2);
    expect(v.z).toBeCloseTo(0);
  });

  it("doesn't move faster diagonally", () => {
    const v = velocityFromInput({ forward: 1, right: 1 }, 0, 2);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(2);
  });

  it("ignores tiny joystick drift", () => {
    expect(velocityFromInput({ forward: 0.01, right: 0.01 }, 0, 2)).toEqual({
      x: 0,
      z: 0,
    });
  });

  it("faces the direction of travel and turns the short way round", () => {
    expect(facingFor(0, 1)).toBeCloseTo(0);
    expect(facingFor(1, 0)).toBeCloseTo(Math.PI / 2);
    // from +170° to -170° should go through 180°, not back through 0°
    const next = turnTowards(
      (170 * Math.PI) / 180,
      (-170 * Math.PI) / 180,
      0.5,
    );
    expect(next).toBeGreaterThan((170 * Math.PI) / 180);
  });
});
