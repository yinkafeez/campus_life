import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb, silentLogger } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import { attachRealtime } from '../src/core/realtime/socket.js';
import { isOnline, resetPresence } from '../src/core/realtime/presence.js';
import { signAccessToken } from '../src/modules/auth/auth.tokens.js';
import { bus, EVENTS } from '../src/core/events.js';
import {
  Friendship,
  Player,
  PlayerRelation,
  StudentRecord,
  University,
  User,
} from '../src/modules/models.js';

const ADMIN_KEY = 'test-only-admin-key-0123456789abcdef0123';
const { app, env } = buildTestApp({ ADMIN_API_KEY: ADMIN_KEY });
let server;
let io;
let url;
const clients = [];

beforeAll(async () => {
  await connectTestDb();
  await importSeeds();
  server = createServer(app);
  io = attachRealtime(server, { env, logger: silentLogger, tickMs: 40, interestRadius: 60 });
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((resolve) => io.close(() => resolve()));
  await closeTestDb();
});
beforeEach(async () => {
  await Promise.all(
    [User, Player, StudentRecord, Friendship, PlayerRelation].map((M) => M.deleteMany({})),
  );
});
afterEach(() => {
  clients.splice(0).forEach((c) => c.disconnect());
  resetPresence();
});

const ZONE = 'unilag-senate-lagoon';

function open(who) {
  const socket = connect(url, {
    auth: who ? { token: who.token } : {},
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  return socket;
}
const connected = (socket) =>
  new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
const next = (socket, event, ms = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} within ${ms}ms`)), ms);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
const nothing = (socket, event, ms = 400) =>
  new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`unexpected ${event}`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });
const join = (socket, pos = { x: 0, z: 30 }) =>
  socket.emitWithAck('zone:join', { zone: ZONE, ...pos });

async function inZone(opts) {
  const who = await makePlayer(env, { universitySlug: 'unilag', ...opts });
  const socket = open(who);
  await connected(socket);
  return { who, socket };
}

describe('connection', () => {
  it('refuses sockets without a valid sign-in', async () => {
    const socket = open(null);
    await expect(connected(socket)).rejects.toThrow();
  });

  it('marks the player online while connected', async () => {
    const { who, socket } = await inZone();
    expect(isOnline(who.player._id)).toBe(true);
    socket.disconnect();
    await new Promise((r) => setTimeout(r, 150));
    expect(isOnline(who.player._id)).toBe(false);
  });
});

describe('zone presence', () => {
  it('join → sees others; others get presence:join, moves and leave', async () => {
    const a = await inZone();
    const b = await inZone();
    expect((await join(a.socket)).players).toEqual([]);

    const joined = next(a.socket, 'presence:join');
    const ack = await join(b.socket, { x: 2, z: 30 });
    expect(ack.ok).toBe(true);
    expect(ack.players.map((el) => el.playerId)).toEqual([String(a.who.player._id)]);
    expect((await joined).playerId).toBe(String(b.who.player._id));

    const moved = next(a.socket, 'presence:snapshot');
    b.socket.emit('presence:move', { x: 3, z: 30, rotY: 1, anim: 'walk', seq: 1 });
    expect((await moved).players).toEqual([
      expect.objectContaining({ playerId: String(b.who.player._id), x: 3, anim: 'walk' }),
    ]);

    const left = next(a.socket, 'presence:leave');
    b.socket.disconnect();
    expect((await left).playerId).toBe(String(b.who.player._id));
  });

  it('rejects unknown zones and impossible jumps', async () => {
    const a = await inZone();
    expect((await a.socket.emitWithAck('zone:join', { zone: 'atlantis', x: 0, z: 0 })).ok).toBe(
      false,
    );
    await join(a.socket);
    const correction = next(a.socket, 'presence:correct');
    a.socket.emit('presence:move', { x: 300, z: 300 });
    expect(await correction).toMatchObject({ x: 0, z: 30 });
  });

  it('players who blocked each other never see each other', async () => {
    const a = await inZone();
    const b = await inZone();
    await request(app)
      .post('/api/v1/social/blocks')
      .set(a.who.auth)
      .send({ playerId: String(b.who.player._id) });
    await new Promise((r) => setTimeout(r, 100)); // relation change refreshes socket safety lists

    await join(a.socket);
    const silent = nothing(a.socket, 'presence:join');
    const ack = await join(b.socket);
    expect(ack.players).toEqual([]);
    await silent;
  });
});

describe('interest management and ordering', () => {
  it('one leave per player — only when the last tab goes', async () => {
    const a = await inZone();
    const b = await inZone();
    const b2 = open(b.who);
    await connected(b2);
    await join(a.socket);
    await join(b.socket, { x: 2, z: 30 });
    await join(b2, { x: 2, z: 30 });
    await new Promise((r) => setTimeout(r, 120));

    const early = nothing(a.socket, 'presence:leave', 300);
    b.socket.disconnect();
    await early;
    const left = next(a.socket, 'presence:leave');
    b2.disconnect();
    expect((await left).playerId).toBe(String(b.who.player._id));
  });

  it('far-away players are out of view until they come close', async () => {
    const a = await inZone();
    const b = await inZone();
    await join(a.socket, { x: 0, z: 0 });
    const ack = await join(b.socket, { x: 200, z: 0 });
    expect(ack.players).toEqual([]);
    expect(ack.interestRadius).toBe(60);

    const appeared = next(a.socket, 'presence:join');
    await join(b.socket, { x: 20, z: 0 }); // arriving (e.g. through a zone entrance) nearby
    expect((await appeared).playerId).toBe(String(b.who.player._id));

    const gone = next(a.socket, 'presence:leave');
    await join(b.socket, { x: 300, z: 0 });
    expect((await gone).playerId).toBe(String(b.who.player._id));
  });

  it('drops out-of-order movement updates', async () => {
    const a = await inZone();
    const b = await inZone();
    await join(a.socket);
    await join(b.socket, { x: 2, z: 30 });
    await new Promise((r) => setTimeout(r, 100));
    const snaps = [];
    a.socket.on('presence:snapshot', (snap) => snaps.push(...snap.players));
    b.socket.emit('presence:move', { x: 3, z: 30, seq: 5 });
    b.socket.emit('presence:move', { x: 2.5, z: 30, seq: 4 }); // a late packet
    await new Promise((r) => setTimeout(r, 200));
    expect(snaps.map((el) => el.x)).toEqual([3]);
  });

  it('spends a per-socket budget — floods are dropped with SLOW_DOWN', async () => {
    const a = await inZone();
    await join(a.socket);
    const acks = await Promise.all(
      Array.from({ length: 20 }, () => a.socket.emitWithAck('interact:emote', { emote: 'wave' })),
    );
    expect(acks.some((el) => el.error?.code === 'SLOW_DOWN')).toBe(true);
    const res = await request(app)
      .get('/api/v1/admin/realtime/metrics')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.data.metrics).toMatchObject({
      connections: expect.any(Number),
      playersInZones: 1,
    });
    expect(res.body.data.metrics.droppedEvents).toBeGreaterThan(0);
  });

  it('disconnects a socket when its access token expires', async () => {
    const who = await makePlayer(env, { universitySlug: 'unilag' });
    const token = signAccessToken(
      { ...env, ACCESS_TOKEN_TTL_MINUTES: 0.02 },
      { user: who.user, session: { _id: who.user._id } },
    );
    const socket = open({ token });
    await connected(socket);
    await next(socket, 'auth:expired', 4000);
    await new Promise((r) => setTimeout(r, 50));
    expect(socket.connected).toBe(false);
  });
});

describe('server-verified arrivals', () => {
  it('a place only counts as visited where the server saw you stand', async () => {
    const a = await inZone();
    await join(a.socket, { x: 0, z: 30 });
    const far = await request(app)
      .post('/api/v1/campus/discoveries')
      .set(a.who.auth)
      .send({ locationSlug: 'university-library' });
    expect(far.status).toBe(409);
    expect(far.body.error.code).toBe('NOT_THERE');

    await join(a.socket, { x: -22, z: 18 }); // standing at the library
    const there = await request(app)
      .post('/api/v1/campus/discoveries')
      .set(a.who.auth)
      .send({ locationSlug: 'university-library' });
    expect(there.status).toBeLessThan(300);
  });
});

describe('proximity interactions', () => {
  it('emotes reach viewers; greetings need you to stand close', async () => {
    const a = await inZone();
    const b = await inZone();
    await join(a.socket, { x: 0, z: 0 });
    await join(b.socket, { x: 10, z: 0 });
    await new Promise((r) => setTimeout(r, 100));

    const seen = next(a.socket, 'interact:emote');
    expect((await b.socket.emitWithAck('interact:emote', { emote: 'wave' })).ok).toBe(true);
    expect(await seen).toMatchObject({ playerId: String(b.who.player._id), emote: 'wave' });

    const target = { playerId: String(a.who.player._id) };
    expect((await b.socket.emitWithAck('interact:greet', target)).error.code).toBe('TOO_FAR');
    await join(b.socket, { x: 2, z: 0 });
    const greeted = next(a.socket, 'interact:greet');
    expect((await b.socket.emitWithAck('interact:greet', target)).ok).toBe(true);
    expect((await greeted).from.playerId).toBe(String(b.who.player._id));
  });
});

describe('zone chat', () => {
  it('delivers filtered chat with contacts hidden; muters do not receive it', async () => {
    const a = await inZone();
    const b = await inZone();
    const muter = await inZone();
    await Promise.all([join(a.socket), join(b.socket), join(muter.socket)]);
    await request(app)
      .post('/api/v1/social/mutes')
      .set(muter.who.auth)
      .send({ playerId: String(a.who.player._id) });
    await new Promise((r) => setTimeout(r, 100));

    const got = next(b.socket, 'chat:message');
    const quiet = nothing(muter.socket, 'chat:message');
    const ack = await a.socket.emitWithAck('chat:send', {
      text: 'Who dey 2001? Call me 08031234567',
    });
    expect(ack.ok).toBe(true);
    const line = await got;
    expect(line.text).toContain('[contact hidden]');
    expect(line.text).not.toMatch(/0803/);
    expect(line.id).toBeTruthy(); // reportable
    await quiet;
  });

  it('nearby chat reaches only close players; retries are not re-sent', async () => {
    const a = await inZone();
    const near = await inZone();
    const far = await inZone();
    await join(a.socket, { x: 0, z: 0 });
    await join(near.socket, { x: 5, z: 0 });
    await join(far.socket, { x: 40, z: 0 });

    const got = [];
    near.socket.on('chat:message', (m) => got.push(m));
    const quiet = nothing(far.socket, 'chat:message');
    const line = { text: 'hi neighbour', range: 'nearby', clientId: 'c-1' };
    const first = await a.socket.emitWithAck('chat:send', line);
    const retry = await a.socket.emitWithAck('chat:send', line);
    expect(first.ok).toBe(true);
    expect(retry).toMatchObject({ ok: true, duplicate: true, message: { id: first.message.id } });
    await quiet;
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ text: 'hi neighbour', range: 'nearby' });
  });

  it('refuses chat before joining a zone', async () => {
    const a = await inZone();
    expect((await a.socket.emitWithAck('chat:send', { text: 'hello' })).error.code).toBe(
      'NOT_IN_ZONE',
    );
  });
});

describe('leadership pushes', () => {
  it('announcements reach only students inside the office scope', async () => {
    const a = await inZone({ programmeCode: 'CSC' });
    const other = await inZone({ programmeCode: 'MTH' });
    const record = await StudentRecord.findOne({ player: a.who.player._id });
    const university = await University.findOne({ slug: 'unilag' });
    const got = next(a.socket, 'leadership:announcement');
    const quiet = nothing(other.socket, 'leadership:announcement');
    bus.emit(EVENTS.ANNOUNCEMENT, {
      universityId: String(university._id),
      scope: { type: 'department', unit: String(record.department) },
      title: 'Departmental week',
      from: { displayName: 'Rep', office: 'Class Rep' },
    });
    expect((await got).title).toBe('Departmental week');
    await quiet;
  });
});

describe('live social updates', () => {
  it('pushes friend requests and messages to the player room', async () => {
    const a = await inZone({ privacy: { messagesFrom: 'everyone' } });
    const sender = await makePlayer(env);

    const req = next(a.socket, 'friend:request');
    await request(app)
      .post('/api/v1/social/friend-requests')
      .set(sender.auth)
      .send({ username: a.who.username });
    expect((await req).from.playerId).toBe(String(sender.player._id));

    const thread = await request(app)
      .post('/api/v1/messages/conversations/direct')
      .set(sender.auth)
      .send({ playerId: String(a.who.player._id) });
    const pushed = next(a.socket, 'message:new');
    await request(app)
      .post(`/api/v1/messages/conversations/${thread.body.data.conversation.id}/messages`)
      .set(sender.auth)
      .send({ text: 'Welcome to Akoka!' });
    expect((await pushed).message.text).toBe('Welcome to Akoka!');
  });

  it("tells friends what you're doing on campus (unless you turned it off)", async () => {
    const a = await inZone();
    const friend = await makePlayer(env, { universitySlug: 'unilag' });
    // activities count only where the server sees you: the friend stands at 2001 Cafeteria
    const friendSocket = open(friend);
    await connected(friendSocket);
    await join(friendSocket, { x: 22, z: 18 });
    const sent = await request(app)
      .post('/api/v1/social/friend-requests')
      .set(friend.auth)
      .send({ username: a.who.username });
    await request(app)
      .post(`/api/v1/social/friend-requests/${sent.body.data.request._id}/accept`)
      .set(a.who.auth);

    const update = next(a.socket, 'social:update');
    await request(app)
      .post('/api/v1/campus/activities')
      .set(friend.auth)
      .send({ locationSlug: '2001-cafeteria', activityKey: 'buy-jollof' });
    expect(await update).toMatchObject({ type: 'activity', location: { slug: '2001-cafeteria' } });

    await request(app)
      .patch('/api/v1/social/privacy')
      .set(friend.auth)
      .send({ shareActivity: false });
    const quiet = nothing(a.socket, 'social:update');
    await request(app)
      .post('/api/v1/campus/activities')
      .set(friend.auth)
      .send({ locationSlug: '2001-cafeteria', activityKey: 'buy-jollof' });
    await quiet;
  });
});
