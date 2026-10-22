import { MeshStandardMaterial } from "three";

// One material per colour, shared by every character on screen (fewer GPU state changes).
const cache = new Map();

export function materialFor(
  hex,
  { roughness = 0.8, metalness = 0, opacity = 1 } = {},
) {
  const key = `${hex}|${roughness}|${metalness}|${opacity}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new MeshStandardMaterial({
        color: hex,
        roughness,
        metalness,
        transparent: opacity < 1,
        opacity,
      }),
    );
  }
  return cache.get(key);
}
