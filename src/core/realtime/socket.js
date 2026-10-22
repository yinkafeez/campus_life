import { Server } from 'socket.io';
import { z } from 'zod';
import { bus, EVENTS } from '../events.js';
import { ACCESS_COOKIE } from '../../modules/auth/auth.tokens.js';
import { authenticate } from '../middleware/auth.js';
import Player from '../../modules/players/player.model.js';
import Character from '../../modules/wardrobe/character.model.js';
import PlayerRelation from '../../modules/social/relation.model.js';
import { friendIds, hiddenPlayerIds } from '../../modules/social/social.service.js';
import { universityOfPlayer } from '../../modules/campus/campus.service.js';
import { audienceIncludes, studentScopes } from '../../modules/community/community.service.js';
import { guardChat } from '../../modules/moderation/chatGuard.js';
import { rememberChat } from '../../modules/moderation/chatLog.js';
import { markOffline, markOnline, presenceOf } from './presence.js';
import { ZoneHub } from './zones.js';
import { createMetrics, registerRealtime } from './metrics.js';

/*
 * REALTIME (Socket.IO) — presence in campus zones, zone chat and live social updates.
 *
 * Rooms:  player:<playerId>  → one player's devices (notifications)
 *         uni:<universityId> → everyone online at a university (leader announcements)
 * Zone presence is NOT a broadcast room: the ZoneHub (zones.js) keeps each zone's transient
 * state and sends every socket one batched snapshot per tick, limited to its interest area.
 *
 * The server is authoritative: positions are bounded and speed-checked, every client event
 * spends from a per-socket budget, and a socket is cut off when its access token expires
 * (the client refreshes over REST and reconnects). Persistent state never lives here.
 * Players who blocked each other never see each other's presence or chat;
 * players who muted someone don't get that person's chat lines.
 */

export const MAX_SPEED = 7; // m/s — running is 4.6; anything faster is ignored as a glitch/cheat
const WORLD_LIMIT = 500; // |x|, |z| in metres
const POSITION_SLACK = 1.5; // m
export const NEARBY_CHAT_M = 15; // "nearby" chat reaches players within this distance
export const GREET_RANGE_M = 4; // you must be this close to greet someone
const EMOTES = ['wave', 'clap', 'dance', 'cheer', 'laugh', 'thumbs-up'];
const CHAT_MEMORY = 30; // recent client message ids remembered per player (retry deduplication)

const playerRoom = (id) => `player:${id}`;
const uniRoom = (id) => `uni:${id}`;

function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Token bucket: `rate` events per second, bursts up to `burst`. */
function bucket(rate, burst) {
  const state = { tokens: burst, at: Date.now() };
  return () => {
    const now = Date.now();
    state.tokens = Math.min(burst, state.tokens + ((now - state.at) / 1000) * rate);
    state.at = now;
    if (state.tokens < 1) return false;
    state.tokens -= 1;
    return true;
  };
}

const coord = z.number().finite().min(-WORLD_LIMIT).max(WORLD_LIMIT);
const positionSchema = z.object({
  x: coord,
  z: coord,
  rotY: z.number().finite().min(-100).max(100).default(0),
  anim: z.enum(['idle', 'walk', 'run']).default('idle'),
  seq: z.number().int().nonnegative().optional(),
});
const joinSchema = positionSchema.extend({ zone: z.string().trim().max(60) });
const chatSchema = z.object({
  text: z.string().min(1).max(500),
  range: z.enum(['zone', 'nearby']).default('zone'),
  clientId: z.string().trim().min(1).max(64).optional(),
});
const emoteSchema = z.object({ emote: z.enum(EMOTES) });
const greetSchema = z.object({ playerId: z.string().regex(/^[a-f\d]{24}$/i) });

const errorAck = (err) => ({
  ok: false,
  error: {
    code: err.code ?? 'ERROR',
    message: err.isOperational ? err.message : 'Something went wrong.',
  },
});
const SLOW_DOWN = {
  ok: false,
  error: { code: 'SLOW_DOWN', message: 'Too many actions — slow down a little.' },
};

async function lookOf(playerId) {
  const character = await Character.findOne({ player: playerId })
    .select('appearance equipped')
    .lean();
  return character
    ? { appearance: character.appearance, equipped: character.equipped ?? {} }
    : null;
}

const infoOf = (socket) => ({
  username: socket.data.username,
  displayName: socket.data.displayName,
  look: socket.data.look,
});

export function attachRealtime(
  httpServer,
  { env, logger, tickMs = 100, interestRadius = 60, maxVisible = 50 },
) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 20_000,
  });
  const metrics = createMetrics();
  const hub = new ZoneHub({ tickMs, radius: interestRadius, maxVisible, metrics });
  registerRealtime({ metrics, hub });
  const recentChat = new Map(); // playerId → Map(clientId → delivered message)

  // load the safety lists a socket filters by (refreshed when the player blocks/mutes someone)
  async function loadSafety(socket) {
    const [hidden, mutedBy] = await Promise.all([
      hiddenPlayerIds(socket.data.playerId),
      PlayerRelation.find({ type: 'mute', target: socket.data.playerId }).select('owner'),
    ]);
    socket.data.hidden = hidden;
    socket.data.mutedBy = new Set(mutedBy.map((el) => String(el.owner)));
  }

  // ── AUTH ────────────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token =
        (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
        readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
      const { user, expiresAt } = await authenticate(env, token);
      const player = await Player.findOne({ user: user._id });
      if (!player)
        throw Object.assign(new Error('No player profile found.'), { data: { code: 'NO_PLAYER' } });
      const university = await universityOfPlayer(player._id);

      socket.data.playerId = String(player._id);
      socket.data.displayName = player.displayName;
      socket.data.username = user.username;
      socket.data.privacy = player.privacy ?? {};
      socket.data.expiresAt = expiresAt;
      socket.data.university = university
        ? { id: String(university._id), zones: university.config.world?.zones ?? [] }
        : null;
      socket.data.look = await lookOf(player._id);
      socket.data.scopes = await studentScopes(player._id);
      await loadSafety(socket);
      next();
    } catch (err) {
      const failure = new Error(err.isOperational ? err.message : 'Not signed in.');
      failure.data = { code: err.code ?? err.data?.code ?? 'UNAUTHENTICATED' };
      next(failure);
    }
  });

  // ── CONNECTION ──────────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const { playerId } = socket.data;
    metrics.connected();
    socket.join(playerRoom(playerId));
    if (socket.data.university) socket.join(uniRoom(socket.data.university.id));
    const firstDevice = presenceOf(playerId) === null;
    markOnline(playerId, socket.id);

    if (firstDevice && socket.data.privacy.showOnline !== false) {
      friendIds(playerId)
        .then((ids) =>
          ids.forEach((id) =>
            io.to(playerRoom(id)).emit('social:update', { type: 'friend-online', playerId }),
          ),
        )
        .catch((err) => logger.warn({ err: err.message }, 'friend-online broadcast failed'));
    }

    // the session ends with the access token: the client refreshes it and reconnects
    const expire = () => {
      metrics.authExpired();
      socket.emit('auth:expired');
      socket.disconnect(true);
    };
    const expiryTimer =
      socket.data.expiresAt && socket.data.expiresAt - Date.now() < 2 ** 31 - 1
        ? setTimeout(expire, Math.max(0, socket.data.expiresAt - Date.now()))
        : null;

    // EVENT BUDGET — movement has its own (8 Hz client rate + slack); everything else shares one
    const allowMove = bucket(12, 20);
    const allowOther = bucket(4, 12);
    const allowEmote = bucket(0.7, 2);
    const allowLook = bucket(0.3, 2);
    socket.use((packet, nextPacket) => {
      metrics.eventIn();
      if (socket.data.expiresAt && Date.now() >= socket.data.expiresAt) return expire();
      const allowed = packet[0] === 'presence:move' ? allowMove() : allowOther();
      if (allowed) return nextPacket();
      metrics.dropped();
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') ack(SLOW_DOWN);
      return undefined;
    });

    function leaveZone() {
      if (!socket.data.zoneRoom) return;
      hub.leave(socket, socket.data.zoneRoom);
      socket.data.zoneRoom = null;
    }

    // ENTER A ZONE → ack with everyone already in view
    socket.on('zone:join', (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      try {
        const parsed = joinSchema.safeParse(payload);
        const uni = socket.data.university;
        if (!parsed.success || !uni)
          return ack({ ok: false, error: { code: 'BAD_ZONE', message: 'Unknown zone.' } });
        const { zone, seq, ...position } = parsed.data;
        // the arrival plaza is open to everyone; other zones must be in the university's world
        if (zone !== 'arrival-plaza' && !uni.zones.includes(zone)) {
          return ack({ ok: false, error: { code: 'BAD_ZONE', message: 'Unknown zone.' } });
        }
        leaveZone();
        const room = `zone:${uni.id}:${zone}`;
        socket.data.position = { ...position, at: Date.now() };
        socket.data.zoneRoom = room;
        const players = hub.join(socket, room, position, infoOf(socket));
        if (seq != null) hub.move(socket, room, { ...position, seq });
        return ack({ ok: true, players, tickMs: hub.tickMs, interestRadius: hub.radius });
      } catch (err) {
        logger.warn({ err: err.message }, 'zone:join failed');
        return ack(errorAck(err));
      }
    });

    // MOVE — bounded, speed-checked, ordered; delivered in the next batched snapshot
    socket.on('presence:move', (payload) => {
      if (!socket.data.zoneRoom) return;
      const parsed = positionSchema.safeParse(payload);
      if (!parsed.success) return;
      const now = Date.now();
      const last = socket.data.position;
      const seconds = Math.max(0.05, (now - last.at) / 1000);
      const distance = Math.hypot(parsed.data.x - last.x, parsed.data.z - last.z);
      if (distance > MAX_SPEED * seconds + POSITION_SLACK) {
        socket.emit('presence:correct', { x: last.x, z: last.z, rotY: last.rotY });
        return;
      }
      if (!hub.move(socket, socket.data.zoneRoom, parsed.data)) return; // stale / duplicate
      const { seq, ...position } = parsed.data;
      socket.data.position = { ...position, at: now };
    });

    // CHAT — zone-wide or nearby only; filtered (contacts hidden), rate-limited, quotable for
    // reports; a retried message (same clientId) is acknowledged again but never re-sent
    socket.on('chat:send', async (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      try {
        const parsed = chatSchema.safeParse(payload);
        if (!parsed.success)
          return ack({
            ok: false,
            error: { code: 'BAD_MESSAGE', message: 'Message is empty or too long.' },
          });
        const room = socket.data.zoneRoom;
        if (!room)
          return ack({ ok: false, error: { code: 'NOT_IN_ZONE', message: 'Join a zone first.' } });
        const { clientId, range } = parsed.data;
        const mine = recentChat.get(playerId) ?? new Map();
        if (clientId && mine.has(clientId))
          return ack({ ok: true, message: mine.get(clientId), duplicate: true });

        const { text } = await guardChat(playerId, parsed.data.text, { isPublic: true });
        const line = rememberChat({ sender: playerId, zoneRoom: room, text });
        const message = {
          id: line.id,
          from: { playerId, username: socket.data.username, displayName: socket.data.displayName },
          text,
          range,
          at: line.at,
          clientId,
        };
        if (clientId) {
          mine.set(clientId, message);
          if (mine.size > CHAT_MEMORY) mine.delete(mine.keys().next().value);
          recentChat.set(playerId, mine);
        }
        const blocked = new Set([...socket.data.hidden, ...socket.data.mutedBy]);
        const everyone =
          range === 'nearby'
            ? hub.nearby(socket, room, NEARBY_CHAT_M)
            : [...(hub.zones.get(room)?.values() ?? [])];
        const me = hub.zones.get(room)?.get(playerId);
        const recipients = new Set(me?.sockets ?? [socket]); // all my own tabs in this zone
        everyone
          .filter((e) => !blocked.has(e.playerId))
          .forEach((e) => e.sockets.forEach((s) => recipients.add(s)));
        recipients.forEach((s) => s.emit('chat:message', message));
        return ack({ ok: true, message });
      } catch (err) {
        return ack(errorAck(err));
      }
    });

    // EMOTE — seen by everyone who currently has you in view
    socket.on('interact:emote', (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const parsed = emoteSchema.safeParse(payload);
      if (!parsed.success || !socket.data.zoneRoom)
        return ack({ ok: false, error: { code: 'BAD_EMOTE', message: 'Unknown emote.' } });
      if (!allowEmote()) return ack(SLOW_DOWN);
      const event = { playerId, emote: parsed.data.emote, at: Date.now() };
      for (const e of hub.zones.get(socket.data.zoneRoom)?.values() ?? []) {
        for (const s of e.sockets)
          if (s.data.known?.has(playerId) || e.playerId === playerId)
            s.emit('interact:emote', event);
      }
      return ack({ ok: true });
    });

    // GREET — a proximity interaction: only when standing next to the other player
    socket.on('interact:greet', (payload, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      const parsed = greetSchema.safeParse(payload);
      const room = socket.data.zoneRoom;
      if (!parsed.success || !room)
        return ack({ ok: false, error: { code: 'BAD_TARGET', message: 'Nobody to greet.' } });
      const target = parsed.data.playerId;
      const near = hub.nearby(socket, room, GREET_RANGE_M).some((e) => e.playerId === target);
      if (!near || socket.data.hidden.has(target)) {
        return ack({
          ok: false,
          error: { code: 'TOO_FAR', message: 'Walk closer to greet them.' },
        });
      }
      io.to(playerRoom(target)).emit('interact:greet', {
        from: { playerId, username: socket.data.username, displayName: socket.data.displayName },
        at: Date.now(),
      });
      return ack({ ok: true });
    });

    // the client changed its look in the wardrobe → re-sent to viewers on the next tick
    socket.on('look:refresh', async () => {
      if (!allowLook()) return;
      socket.data.look = await lookOf(playerId).catch(() => socket.data.look);
      if (socket.data.zoneRoom) hub.updateInfo(playerId, socket.data.zoneRoom, infoOf(socket));
    });

    socket.on('disconnect', () => {
      metrics.disconnected();
      if (expiryTimer) clearTimeout(expiryTimer);
      leaveZone();
      const lastDevice = markOffline(playerId, socket.id);
      if (lastDevice) {
        recentChat.delete(playerId);
        if (socket.data.privacy.showOnline !== false) {
          friendIds(playerId)
            .then((ids) =>
              ids.forEach((id) =>
                io.to(playerRoom(id)).emit('social:update', { type: 'friend-offline', playerId }),
              ),
            )
            .catch(() => {});
        }
      }
    });
  });

  // ── BUS → SOCKETS ───────────────────────────────────────────────────────
  const listeners = {
    [EVENTS.FRIEND_REQUEST]: (e) => io.to(playerRoom(e.toPlayerId)).emit('friend:request', e),
    [EVENTS.FRIEND_ACCEPTED]: (e) => io.to(playerRoom(e.toPlayerId)).emit('friend:accepted', e),
    [EVENTS.MESSAGE_SENT]: (e) =>
      e.toPlayerIds.forEach((id) =>
        io.to(playerRoom(id)).emit('message:new', { message: e.message, from: e.from }),
      ),
    [EVENTS.INVITATION_SENT]: (e) => io.to(playerRoom(e.toPlayerId)).emit('invitation:new', e),
    [EVENTS.CHALLENGE_SENT]: (e) => io.to(playerRoom(e.toPlayerId)).emit('game:challenge', e),
    [EVENTS.CHALLENGE_FINISHED]: (e) => io.to(playerRoom(e.toPlayerId)).emit('game:result', e),
    [EVENTS.ELECTION_RESULT]: (e) => io.to(playerRoom(e.toPlayerId)).emit('election:result', e),
    [EVENTS.WELFARE_GRANT]: (e) => io.to(playerRoom(e.toPlayerId)).emit('leadership:welfare', e),
    // a leader's announcement reaches online students inside the office's scope only
    [EVENTS.ANNOUNCEMENT]: async (e) => {
      try {
        const sockets = await io.in(uniRoom(e.universityId)).fetchSockets();
        sockets
          .filter((s) => audienceIncludes(e.scope, s.data.scopes ?? {}))
          .forEach((s) =>
            s.emit('leadership:announcement', { title: e.title, from: e.from, scope: e.scope }),
          );
      } catch (err) {
        logger.warn({ err: err.message }, 'announcement push failed');
      }
    },
    [EVENTS.ACTIVITY_DONE]: async (e) => {
      try {
        const player = await Player.findById(e.playerId).select('privacy');
        if (player?.privacy?.shareActivity === false) return;
        const ids = await friendIds(e.playerId);
        ids.forEach((id) =>
          io.to(playerRoom(id)).emit('social:update', { type: 'activity', ...e }),
        );
      } catch (err) {
        logger.warn({ err: err.message }, 'activity broadcast failed');
      }
    },
    [EVENTS.RELATION_CHANGED]: async (e) => {
      try {
        const sockets = await io.in(e.playerIds.map(playerRoom)).fetchSockets();
        await Promise.all(sockets.map((s) => loadSafety(s)));
      } catch (err) {
        logger.warn({ err: err.message }, 'safety list refresh failed');
      }
    },
    // the account is gone: close its live connections
    [EVENTS.ACCOUNT_DELETED]: (e) => io.in(playerRoom(e.playerId)).disconnectSockets(true),
    [EVENTS.MODERATION_ACTION]: (e) => {
      io.to(playerRoom(e.toPlayerId)).emit('moderation:notice', {
        action: e.action,
        until: e.until,
        reason: e.reason,
      });
      if (e.action === 'suspend') io.in(playerRoom(e.toPlayerId)).disconnectSockets(true);
    },
  };
  Object.entries(listeners).forEach(([name, fn]) => bus.on(name, fn));

  // tests / shutdown: detach from the bus so a closed server leaves no listeners behind
  const close = io.close.bind(io);
  io.close = (cb) => {
    Object.entries(listeners).forEach(([name, fn]) => bus.off(name, fn));
    hub.stop();
    metrics.stop();
    registerRealtime(null);
    return close(cb);
  };
  io.hub = hub;
  io.metrics = metrics;
  return io;
}
