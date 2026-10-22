/*
 * ZONE HUB — the transient multiplayer state of every campus zone (memory only; nothing here
 * is persisted — saved positions go through the REST API).
 *
 * Measured problem (see docs/DEPLOYMENT.md): forwarding every movement packet to everyone in
 * the zone is O(N²) messages — at 100 players that is ~79,000 messages/s and latency
 * collapses to seconds. Instead the hub:
 *   - keeps the latest position per PLAYER (not per tab), dropping out-of-order updates (seq)
 *   - ticks every `tickMs` and sends each watching socket ONE batched snapshot of the players
 *     that moved, limited to its area of interest (`radius`, found with a uniform grid)
 *   - caps each view at the `maxVisible` nearest players (a crowd of 200 costs O(N·K), not
 *     O(N²), and no phone has to draw 200 avatars)
 *   - sends presence:join / presence:leave when a player enters / leaves your interest
 *     area (or the zone), once per player even with several tabs open
 */
export class ZoneHub {
  constructor({ tickMs = 100, radius = 60, cell = 20, maxVisible = 50, metrics, onTick } = {}) {
    this.maxVisible = maxVisible;
    this.tickMs = tickMs;
    this.radius = radius;
    this.cell = cell;
    this.metrics = metrics;
    this.zones = new Map(); // room → Map(playerId → entry)
    this.timer = tickMs > 0 ? setInterval(() => this.tick(), tickMs) : null;
    this.timer?.unref?.();
    this.onTick = onTick;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  zone(room) {
    if (!this.zones.has(room)) this.zones.set(room, new Map());
    return this.zones.get(room);
  }

  /** Add a socket to a zone; returns the players it can see right now. */
  join(socket, room, position, info) {
    const players = this.zone(room);
    let entry = players.get(socket.data.playerId);
    if (!entry) {
      entry = {
        playerId: socket.data.playerId,
        info,
        sockets: new Set(),
        seq: -1,
        dirty: true,
        lookDirty: false,
        ...position,
      };
      players.set(entry.playerId, entry);
    } else {
      Object.assign(entry, position, { dirty: true });
    }
    entry.sockets.add(socket);
    socket.data.known = new Set();
    const visible = this.visibleTo(socket, room).map((e) => this.publicState(e));
    visible.forEach((e) => socket.data.known.add(e.playerId));
    return visible;
  }

  /** Remove a socket; when it was the player's last tab here, everyone watching is told. */
  leave(socket, room) {
    const players = this.zones.get(room);
    const entry = players?.get(socket.data.playerId);
    if (!entry) return;
    entry.sockets.delete(socket);
    if (entry.sockets.size === 0) {
      players.delete(entry.playerId);
      for (const other of players.values()) {
        for (const s of other.sockets) {
          if (s.data.known?.delete(entry.playerId))
            s.emit('presence:leave', { playerId: entry.playerId });
        }
      }
      if (players.size === 0) this.zones.delete(room);
    }
    socket.data.known = new Set();
  }

  /** Record a validated position. Returns false for stale (out-of-order) updates. */
  move(socket, room, update) {
    const entry = this.zones.get(room)?.get(socket.data.playerId);
    if (!entry) return false;
    if (update.seq != null) {
      if (update.seq <= entry.seq && entry.lastSocket === socket.id) return false; // late duplicate
      entry.seq = update.seq;
      entry.lastSocket = socket.id;
    }
    entry.x = update.x;
    entry.z = update.z;
    entry.rotY = update.rotY;
    entry.anim = update.anim;
    entry.dirty = true;
    return true;
  }

  updateInfo(playerId, room, info) {
    const entry = this.zones.get(room)?.get(playerId);
    if (entry) Object.assign(entry, { info, lookDirty: true });
  }

  /** Where the server last saw this player (any zone), or null when not in a zone. */
  whereIs(playerId) {
    for (const [room, players] of this.zones) {
      const e = players.get(String(playerId));
      if (e) return { room, x: e.x, z: e.z };
    }
    return null;
  }

  position(playerId, room) {
    const e = this.zones.get(room)?.get(playerId);
    return e ? { x: e.x, z: e.z } : null;
  }

  publicState(e) {
    return { playerId: e.playerId, ...e.info, x: e.x, z: e.z, rotY: e.rotY, anim: e.anim };
  }

  grid(players) {
    const cells = new Map();
    for (const e of players.values()) {
      const key = `${Math.floor(e.x / this.cell)}:${Math.floor(e.z / this.cell)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(e);
    }
    return cells;
  }

  /** Entries within `radius` of a point, using the grid (or a linear scan without one). */
  near(players, x, z, radius, cells) {
    const out = [];
    if (!cells) {
      for (const e of players.values()) if (Math.hypot(e.x - x, e.z - z) <= radius) out.push(e);
      return out;
    }
    const span = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    for (let i = cx - span; i <= cx + span; i += 1) {
      for (let j = cz - span; j <= cz + span; j += 1) {
        for (const e of cells.get(`${i}:${j}`) ?? [])
          if (Math.hypot(e.x - x, e.z - z) <= radius) out.push(e);
      }
    }
    return out;
  }

  /** Other players this socket may see (interest radius, minus blocked players). */
  visibleTo(socket, room, cells) {
    const players = this.zones.get(room);
    const me = players?.get(socket.data.playerId);
    if (!me) return [];
    const hidden = socket.data.hidden ?? new Set();
    const seen = this.near(players, me.x, me.z, this.radius, cells).filter(
      (e) => e.playerId !== me.playerId && !hidden.has(e.playerId),
    );
    if (seen.length <= this.maxVisible) return seen;
    const d2 = (e) => (e.x - me.x) ** 2 + (e.z - me.z) ** 2;
    return seen.sort((a, b) => d2(a) - d2(b)).slice(0, this.maxVisible);
  }

  /** Players (other than me) within `radius` metres of me — for proximity interactions. */
  nearby(socket, room, radius) {
    const players = this.zones.get(room);
    const me = players?.get(socket.data.playerId);
    if (!me) return [];
    return this.near(players, me.x, me.z, radius).filter((e) => e.playerId !== me.playerId);
  }

  tick() {
    const started = process.hrtime.bigint();
    let messages = 0;
    for (const [room, players] of this.zones) {
      const cells = this.grid(players);
      for (const me of players.values()) {
        for (const socket of me.sockets) {
          const known = socket.data.known ?? new Set();
          const visible = this.visibleTo(socket, room, cells);
          const visibleIds = new Set(visible.map((e) => e.playerId));
          const moved = [];
          for (const e of visible) {
            if (!known.has(e.playerId) || e.lookDirty) {
              known.add(e.playerId);
              socket.emit('presence:join', this.publicState(e));
              messages += 1;
            } else if (e.dirty) {
              moved.push({ playerId: e.playerId, x: e.x, z: e.z, rotY: e.rotY, anim: e.anim });
            }
          }
          for (const id of known) {
            if (!visibleIds.has(id)) {
              known.delete(id);
              socket.emit('presence:leave', { playerId: id });
              messages += 1;
            }
          }
          if (moved.length) {
            socket.volatile.emit('presence:snapshot', { t: Date.now(), players: moved });
            messages += 1;
          }
        }
      }
      for (const e of players.values()) {
        e.dirty = false;
        e.lookDirty = false;
      }
    }
    this.metrics?.recordTick(Number(process.hrtime.bigint() - started) / 1e6, messages);
    this.onTick?.();
  }

  stats() {
    let players = 0;
    for (const z of this.zones.values()) players += z.size;
    return {
      zones: this.zones.size,
      playersInZones: players,
      tickIntervalMs: this.tickMs,
      interestRadius: this.radius,
      maxVisible: this.maxVisible,
    };
  }
}
