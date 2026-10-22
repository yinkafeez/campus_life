import { z } from 'zod';

// small shared pieces for activity engines

export const itemId = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ids are lowercase letters, digits and dashes');
export const text = (max = 600) => z.string().trim().min(1).max(max);

/** Deterministic PRNG (mulberry32) so a presentation can be rebuilt from its seed. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Opaque per-attempt token (so shuffled options can't be mapped back by id). */
export const token = (rand) =>
  Math.floor(rand() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');

export const uniqueIds = (list, label) =>
  new Set(list.map((el) => el.id)).size === list.length || `${label} ids must be unique`;
