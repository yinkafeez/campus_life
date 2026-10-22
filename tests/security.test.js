import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from '../src/core/db/mongoose.js';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import {
  CampusEvent,
  Character,
  Conversation,
  Friendship,
  Message,
  Player,
  Session,
  StudentRecord,
  University,
  User,
  Wallet,
} from '../src/modules/models.js';

/*
 * SECURITY CONTROLS (Phase 15) — each test pins one documented control (docs/SECURITY.md).
 */
// real bcrypt sign-ups: slow when the whole suite runs in parallel
vi.setConfig({ testTimeout: 60_000 });

const ADMIN_KEY = 'test-only-admin-key-0123456789abcdef0123';
const { app, env } = buildTestApp({
  ADMIN_API_KEY: ADMIN_KEY,
  AUTH_RATE_LIMIT_MAX: '1000',
  CLIENT_URL: 'http://localhost:5173',
});

beforeAll(async () => {
  await connectTestDb();
  await importSeeds();
});
afterAll(closeTestDb);

let n = 0;
async function account() {
  n += 1;
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({
    email: `sec${n}@example.test`,
    username: `sec_${n}`,
    password: 'Jaja-hall-2026',
    displayName: `Sec ${n}`,
    confirmAge: true,
  });
  expect(res.status).toBe(201);
  return { agent, username: `sec_${n}`, user: res.body.data.user, player: res.body.data.player };
}

describe('cross-site requests (CSRF defence in depth)', () => {
  it('refuses requests from origins that are not the game', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ identifier: 'x', password: 'y' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CORS_FORBIDDEN');
  });

  it('refuses form-encoded or text bodies on writes (what an HTML form can send)', async () => {
    const { agent } = await account();
    for (const type of [
      'application/x-www-form-urlencoded',
      'text/plain',
      'multipart/form-data; boundary=x',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await agent.post('/api/v1/auth/logout-all').set('Content-Type', type).send('a=1');
      expect(res.status).toBe(415);
    }
    // the game's own JSON calls still work
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
  });
});

describe('input validation and mass assignment', () => {
  it('rejects unknown fields instead of saving them (no role or token tampering)', async () => {
    const { agent } = await account();
    const patch = await agent
      .patch('/api/v1/players/me')
      .send({ displayName: 'Ok', role: 'admin' });
    expect(patch.status).toBe(400);
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: 'mass@example.test',
      username: 'mass_assign',
      password: 'Jaja-hall-2026',
      displayName: 'Mass',
      confirmAge: true,
      role: 'admin',
    });
    expect(reg.status).toBe(400);
    expect(await User.exists({ username: 'mass_assign' })).toBeNull();
  });

  it('treats operator objects in input as data, not queries (NoSQL injection)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('caps the size of answer objects', async () => {
    const { agent } = await account();
    const answers = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, 'a']));
    const res = await agent
      .post('/api/v1/games/sessions/0123456789abcdef01234567/submit')
      .send({ answer: { answers } });
    expect([400, 404, 409]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });
});

describe('authorization and data exposure', () => {
  it('admin routes need the key or an admin account', async () => {
    expect((await request(app).get('/api/v1/admin/universities')).status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/v1/admin/universities')
          .set('X-Admin-Key', 'wrong-key-wrong-key-wrong-key-wrong')
      ).status,
    ).toBe(403);
    const { agent } = await account();
    expect((await agent.get('/api/v1/admin/universities')).status).toBe(403);
    expect(
      (await request(app).get('/api/v1/admin/universities').set('X-Admin-Key', ADMIN_KEY)).status,
    ).toBe(200);
  });

  it('never returns password hashes, token versions or other players’ emails', async () => {
    const a = await account();
    const b = await account();
    const me = await a.agent.get('/api/v1/auth/me');
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|tokenVersion|failedLoginCount/);
    const profile = await a.agent.get(`/api/v1/social/players/${b.username}`);
    expect(JSON.stringify(profile.body)).not.toContain('@example.test');
    const search = await a.agent.get('/api/v1/social/players?q=sec_');
    expect(JSON.stringify(search.body)).not.toContain('@example.test');
  });

  it('players who hide their profile are not searchable', async () => {
    const a = await account();
    const hidden = await account();
    await hidden.agent.patch('/api/v1/social/privacy').send({ profileVisibility: 'nobody' });
    const search = await a.agent.get(`/api/v1/social/players?q=${hidden.username}`);
    expect(search.body.data.players).toEqual([]);
  });

  it("one player can't read another's conversation or act on their records (IDOR)", async () => {
    const a = await makePlayer(env, {
      universitySlug: 'unilag',
      privacy: { messagesFrom: 'everyone' },
    });
    const b = await makePlayer(env, {
      universitySlug: 'unilag',
      privacy: { messagesFrom: 'everyone' },
    });
    const c = await makePlayer(env, { universitySlug: 'unilag' });
    const thread = await request(app)
      .post('/api/v1/messages/conversations/direct')
      .set(a.auth)
      .send({ playerId: String(b.player._id) });
    const id = thread.body.data.conversation.id;
    const peek = await request(app)
      .get(`/api/v1/messages/conversations/${id}/messages`)
      .set(c.auth);
    expect([403, 404]).toContain(peek.status);
    const post = await request(app)
      .post(`/api/v1/messages/conversations/${id}/messages`)
      .set(c.auth)
      .send({ text: 'let me in' });
    expect([403, 404]).toContain(post.status);
  });

  it("another university's events can't be joined, even by invitation", async () => {
    const unilag = await makePlayer(env, { universitySlug: 'unilag' });
    const other = await University.findOne({ slug: mongoose.trusted({ $ne: 'unilag' }) });
    const event = await CampusEvent.create({
      university: other._id,
      title: 'Elsewhere party',
      kind: 'other',
      host: unilag.player._id,
      locationSlug: 'somewhere',
      startsAt: new Date(Date.now() + 3_600_000),
      endsAt: new Date(Date.now() + 7_200_000),
      visibility: 'public',
      capacity: 10,
      attendees: [],
    });
    const res = await request(app)
      .post(`/api/v1/community/events/${event._id}/rsvp`)
      .set(unilag.auth)
      .send({ going: true });
    expect(res.status).toBe(404);
  });

  it('the public university profile has no admin notes', async () => {
    await University.updateOne({ slug: 'unilag' }, { $set: { dataNotes: 'internal audit note' } });
    const res = await request(app).get('/api/v1/universities/unilag');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('internal audit note');
  });
});

describe('sessions and passwords', () => {
  it('changing the password signs out every other device and old tokens stop working', async () => {
    const a = await account();
    const otherDevice = request.agent(app);
    await otherDevice
      .post('/api/v1/auth/login')
      .send({ identifier: a.username, password: 'Jaja-hall-2026' });
    expect((await otherDevice.get('/api/v1/auth/me')).status).toBe(200);

    const wrong = await a.agent
      .patch('/api/v1/account/password')
      .send({ currentPassword: 'nope-nope-1', newPassword: 'New-pass-2027' });
    expect(wrong.status).toBe(401);
    const ok = await a.agent
      .patch('/api/v1/account/password')
      .send({ currentPassword: 'Jaja-hall-2026', newPassword: 'New-pass-2027' });
    expect(ok.status).toBe(200);

    expect((await otherDevice.get('/api/v1/auth/me')).status).toBe(401); // old access token
    expect((await otherDevice.post('/api/v1/auth/refresh')).status).toBe(401); // old refresh token
    expect((await a.agent.get('/api/v1/auth/me')).status).toBe(200); // this device re-issued
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: a.username, password: 'New-pass-2027' });
    expect(login.status).toBe(200);
  });

  it('weak new passwords are refused', async () => {
    const a = await account();
    const res = await a.agent
      .patch('/api/v1/account/password')
      .send({ currentPassword: 'Jaja-hall-2026', newPassword: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('data rights: export and account deletion', () => {
  it('exports my own data without secrets or other people’s emails', async () => {
    const a = await account();
    const res = await a.agent.get('/api/v1/account/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const data = res.body.data.export;
    expect(data.account.email).toBe(a.user.email);
    expect(data.player.displayName).toBe(a.player.displayName);
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|tokenHash|"secret"/);
  });

  it('deletes the account: login gone, personal data erased, shared threads anonymised', async () => {
    const a = await makePlayer(env, {
      universitySlug: 'unilag',
      privacy: { messagesFrom: 'everyone' },
    });
    // a real password for this fixture user
    await User.updateOne(
      { _id: a.user._id },
      { passwordHash: await User.hashPassword('Jaja-hall-2026') },
    );
    const friend = await makePlayer(env, {
      universitySlug: 'unilag',
      privacy: { messagesFrom: 'everyone' },
    });
    const thread = await request(app)
      .post('/api/v1/messages/conversations/direct')
      .set(a.auth)
      .send({ playerId: String(friend.player._id) });
    await request(app)
      .post(`/api/v1/messages/conversations/${thread.body.data.conversation.id}/messages`)
      .set(a.auth)
      .send({ text: 'my private words' });
    await Character.create({ player: a.player._id, appearance: {}, equipped: {} }).catch(() => {});
    await Wallet.create({ player: a.player._id, balance: 100 }).catch(() => {});
    await Friendship.create({
      pairKey: 'x:y',
      requester: a.player._id,
      recipient: friend.player._id,
      status: 'accepted',
    });

    const noConfirm = await request(app)
      .delete('/api/v1/account')
      .set(a.auth)
      .send({ password: 'Jaja-hall-2026', confirm: 'yes' });
    expect(noConfirm.status).toBe(400);
    const wrongPw = await request(app)
      .delete('/api/v1/account')
      .set(a.auth)
      .send({ password: 'wrong-wrong-1', confirm: 'DELETE MY ACCOUNT' });
    expect(wrongPw.status).toBe(401);

    const res = await request(app)
      .delete('/api/v1/account')
      .set(a.auth)
      .send({ password: 'Jaja-hall-2026', confirm: 'DELETE MY ACCOUNT' });
    expect(res.status).toBe(200);

    expect(await User.exists({ _id: a.user._id })).toBeNull();
    expect(await Session.countDocuments({ user: a.user._id })).toBe(0);
    expect(await StudentRecord.exists({ player: a.player._id })).toBeNull();
    expect(await Character.exists({ player: a.player._id })).toBeNull();
    expect(await Wallet.exists({ player: a.player._id })).toBeNull();
    expect(await Friendship.exists({ requester: a.player._id })).toBeNull();
    const ghost = await Player.findById(a.player._id);
    expect(ghost).toMatchObject({ displayName: 'Deleted player', bio: '' });
    expect(ghost.deletedAt).toBeInstanceOf(Date);
    // the friend's thread still exists, but the words are gone
    const msg = await Message.findOne({ sender: a.player._id });
    expect(msg.text).toBe('[message deleted]');
    expect(await Conversation.exists({ _id: thread.body.data.conversation.id })).not.toBeNull();
    // the old token is dead
    expect((await request(app).get('/api/v1/auth/me').set(a.auth)).status).toBe(401);
  });
});

describe('client error reports', () => {
  it('accepts small anonymous crash reports and refuses junk', async () => {
    const ok = await request(app).post('/api/v1/client-errors').send({
      kind: 'render',
      message: 'Cannot read x of undefined',
      route: '/play?perf=1',
      release: '0.1.0',
    });
    expect(ok.status).toBe(204);
    const bad = await request(app)
      .post('/api/v1/client-errors')
      .send({ kind: 'render', message: 'x', email: 'a@b.c' });
    expect(bad.status).toBe(400);
  });
});
