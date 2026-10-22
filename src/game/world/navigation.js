// Wayfinding on flat zones: a walkability grid built from the zone's colliders, A* over it,
// and small helpers for "what's near me" and "which way is it". Pure → unit-tested.

const SQRT2 = Math.SQRT2;

/** Grid of walkable cells (true = blocked), inflated by the walker's radius. */
export function buildNavGrid(colliders, { cell = 1, radius = 0.5 } = {}) {
  const { bounds, boxes = [], circles = [] } = colliders;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const blocked = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = bounds.minX + (c + 0.5) * cell;
      const z = bounds.minZ + (r + 0.5) * cell;
      const hitBox = boxes.some(
        (b) =>
          x > b.minX - radius &&
          x < b.maxX + radius &&
          z > b.minZ - radius &&
          z < b.maxZ + radius,
      );
      const hitCircle =
        !hitBox &&
        circles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + radius);
      if (hitBox || hitCircle) blocked[r * cols + c] = 1;
    }
  }
  return { cols, rows, cell, bounds, blocked };
}

const toCell = (grid, x, z) => ({
  c: Math.min(
    grid.cols - 1,
    Math.max(0, Math.floor((x - grid.bounds.minX) / grid.cell)),
  ),
  r: Math.min(
    grid.rows - 1,
    Math.max(0, Math.floor((z - grid.bounds.minZ) / grid.cell)),
  ),
});
const toPoint = (grid, c, r) => ({
  x: grid.bounds.minX + (c + 0.5) * grid.cell,
  z: grid.bounds.minZ + (r + 0.5) * grid.cell,
});
const isFree = (grid, c, r) =>
  c >= 0 &&
  r >= 0 &&
  c < grid.cols &&
  r < grid.rows &&
  !grid.blocked[r * grid.cols + c];

// the closest walkable cell (a destination marker may sit right against a wall)
function nearestFree(grid, start) {
  if (isFree(grid, start.c, start.r)) return start;
  for (let ring = 1; ring < Math.max(grid.cols, grid.rows); ring += 1) {
    for (let dc = -ring; dc <= ring; dc += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        if (isFree(grid, start.c + dc, start.r + dr))
          return { c: start.c + dc, r: start.r + dr };
      }
    }
  }
  return null;
}

// a tiny binary heap keyed by f-score
class Heap {
  constructor() {
    this.items = [];
  }
  push(node, score) {
    const items = this.items;
    items.push({ node, score });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].score <= items[i].score) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l].score < items[m].score) m = l;
        if (r < items.length && items[r].score < items[m].score) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top.node;
  }
  get size() {
    return this.items.length;
  }
}

/** A* from → to (world points). Returns simplified waypoints [{x, z}, ...] or null if unreachable. */
export function findPath(grid, from, to) {
  const start = nearestFree(grid, toCell(grid, from.x, from.z));
  const goal = nearestFree(grid, toCell(grid, to.x, to.z));
  if (!start || !goal) return null;

  const { cols } = grid;
  const index = (c, r) => r * cols + c;
  const startI = index(start.c, start.r);
  const goalI = index(goal.c, goal.r);
  const g = new Float32Array(grid.cols * grid.rows).fill(Infinity);
  const came = new Int32Array(grid.cols * grid.rows).fill(-1);
  const closed = new Uint8Array(grid.cols * grid.rows);
  const h = (c, r) => {
    const dc = Math.abs(c - goal.c);
    const dr = Math.abs(r - goal.r);
    return dc + dr + (SQRT2 - 2) * Math.min(dc, dr); // octile distance
  };

  const open = new Heap();
  g[startI] = 0;
  open.push(startI, h(start.c, start.r));
  while (open.size) {
    const current = open.pop();
    if (current === goalI) break;
    if (closed[current]) continue;
    closed[current] = 1;
    const c = current % cols;
    const r = (current - c) / cols;
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (!isFree(grid, nc, nr)) continue;
        // no corner cutting through walls
        if (dc && dr && (!isFree(grid, c + dc, r) || !isFree(grid, c, r + dr)))
          continue;
        const ni = index(nc, nr);
        const cost = g[current] + (dc && dr ? SQRT2 : 1);
        if (cost < g[ni]) {
          g[ni] = cost;
          came[ni] = current;
          open.push(ni, cost + h(nc, nr));
        }
      }
    }
  }
  if (startI !== goalI && came[goalI] === -1) return null;

  const cells = [];
  for (let i = goalI; i !== -1; i = came[i]) {
    cells.push(i);
    if (i === startI) break;
  }
  cells.reverse();
  const points = cells.map((i) =>
    toPoint(grid, i % cols, Math.floor(i / cols)),
  );
  points[0] = { x: from.x, z: from.z };
  points[points.length - 1] = { x: to.x, z: to.z };
  return simplifyPath(grid, points);
}

// line of sight on the grid (sampled every half cell)
function clearLine(grid, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (grid.cell / 2));
  for (let s = 1; s < steps; s += 1) {
    const t = s / steps;
    const { c, r } = toCell(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (!isFree(grid, c, r)) return false;
  }
  return true;
}

/** Drop waypoints you can walk past in a straight line. */
export function simplifyPath(grid, points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  let anchor = points[0];
  for (let i = 2; i < points.length; i += 1) {
    if (!clearLine(grid, anchor, points[i])) {
      anchor = points[i - 1];
      out.push(anchor);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export const pathLength = (points) =>
  points.reduce(
    (sum, p, i) =>
      i ? sum + Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) : 0,
    0,
  );

/** The placed location whose radius the player stands in (closest centre wins), or null. */
export function locationAt(locations, { x, z }) {
  let best = null;
  let bestDist = Infinity;
  for (const loc of locations) {
    if (!loc.world) continue;
    const d = Math.hypot(x - loc.world.x, z - loc.world.z);
    if (d <= (loc.world.radius ?? 4) && d < bestDist) {
      best = loc;
      bestDist = d;
    }
  }
  return best;
}

/** The nearest NPC within `reach` metres, or null. */
export function npcNear(npcs, { x, z }, reach = 3) {
  let best = null;
  let bestDist = reach;
  for (const npc of npcs) {
    const d = Math.hypot(x - npc.x, z - npc.z);
    if (d <= bestDist) {
      best = npc;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Direction to a point relative to where the player faces, in radians
 * (0 = straight ahead, positive = to the right). Models face +Z at rotY 0.
 */
export function relativeBearing({ x, z, rotY }, target) {
  const absolute = Math.atan2(target.x - x, target.z - z);
  let rel = rotY - absolute;
  while (rel > Math.PI) rel -= 2 * Math.PI;
  while (rel < -Math.PI) rel += 2 * Math.PI;
  return rel;
}
