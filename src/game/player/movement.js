// Movement maths for the third-person controller. Pure → unit-tested.

export const WALK_SPEED = 2.2; // m/s
export const RUN_SPEED = 4.6; // m/s
export const TURN_SPEED = 10; // how fast the body turns to face movement (rad/s-ish)

/**
 * Velocity on the XZ plane for an input direction, relative to where the camera looks.
 * input.forward / input.right are in [-1, 1]; cameraYaw is the camera's orbit angle.
 * Diagonals are normalised so moving diagonally isn't faster.
 */
export function velocityFromInput(
  { forward = 0, right = 0 },
  cameraYaw,
  speed,
) {
  const len = Math.hypot(forward, right);
  if (len < 0.05) return { x: 0, z: 0 };
  const f = forward / Math.max(len, 1);
  const r = right / Math.max(len, 1);
  // camera sits behind the player at angle yaw: "forward" points away from it
  const fx = -Math.sin(cameraYaw);
  const fz = -Math.cos(cameraYaw);
  const rx = Math.cos(cameraYaw);
  const rz = -Math.sin(cameraYaw);
  return { x: (fx * f + rx * r) * speed, z: (fz * f + rz * r) * speed };
}

/** The Y rotation that makes a model (facing +Z) look along a velocity. */
export const facingFor = (vx, vz) => Math.atan2(vx, vz);

/** Shortest-path angle interpolation (no 359° spins). */
export function turnTowards(current, target, t) {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, t);
}
