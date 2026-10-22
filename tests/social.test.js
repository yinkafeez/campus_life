import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import { bus, EVENTS } from '../src/core/events.js';
import { Friendship, Player, PlayerRelation, StudentRecord, User } from '../src/modules/models.js';

const { app, env } = buildTestApp();

beforeAll(async () => {
  await connectTestDb();
  await importSeeds();
});
afterAll(closeTestDb);
beforeEach(async () => {
  await Promise.all(
    [User, Player, StudentRecord, Friendship, PlayerRelation].map((M) => M.deleteMany({})),
  );
});

const api = (who) => ({
  get: (url) => request(app).get(`/api/v1/social${url}`).set(who.auth),
  post: (url, body) => request(app).post(`/api/v1/social${url}`).set(who.auth).send(body),
  patch: (url, body) => request(app).patch(`/api/v1/social${url}`).set(who.auth).send(body),
  del: (url) => request(app).delete(`/api/v1/social${url}`).set(who.auth),
});

async function befriend(a, b) {
  const sent = await api(a).post('/friend-requests', { username: b.username });
  await api(b).post(`/friend-requests/${sent.body.data.request._id}/accept`);
}

describe('friend requests', () => {
  it('send → incoming/outgoing → accept → friends, with bus events', async () => {
    const ada = await makePlayer(env);
    const emeka = await makePlayer(env);
    const events = [];
    const onReq = (e) => events.push(['request', e]);
    const onAcc = (e) => events.push(['accepted', e]);
    bus.on(EVENTS.FRIEND_REQUEST, onReq);
    bus.on(EVENTS.FRIEND_ACCEPTED, onAcc);

    const sent = await api(ada).post('/friend-requests', { username: emeka.username });
    expect(sent.status).toBe(201);
    expect((await api(emeka).get('/friends')).body.data.incoming).toHaveLength(1);
    expect((await api(ada).get('/friends')).body.data.outgoing).toHaveLength(1);

    const accepted = await api(emeka).post(`/friend-requests/${sent.body.data.request._id}/accept`);
    expect(accepted.status).toBe(200);
    const friends = (await api(ada).get('/friends')).body.data.friends;
    expect(friends.map((el) => el.username)).toEqual([emeka.username]);
    // no personal data in social cards
    expect(JSON.stringify(friends)).not.toMatch(/@example\.test/);

    bus.off(EVENTS.FRIEND_REQUEST, onReq);
    bus.off(EVENTS.FRIEND_ACCEPTED, onAcc);
    expect(events.map(([type]) => type)).toEqual(['request', 'accepted']);
  });

  it('only the recipient can accept; duplicates and self-requests are refused', async () => {
    const ada = await makePlayer(env);
    const emeka = await makePlayer(env);
    const sent = await api(ada).post('/friend-requests', { username: emeka.username });
    expect(
      (await api(ada).post(`/friend-requests/${sent.body.data.request._id}/accept`)).status,
    ).toBe(404);
    expect(
      (await api(ada).post('/friend-requests', { username: emeka.username })).body.error.code,
    ).toBe('REQUEST_PENDING');
    expect((await api(ada).post('/friend-requests', { username: ada.username })).status).toBe(400);
  });

  it('asking back accepts the pending request', async () => {
    const ada = await makePlayer(env);
    const emeka = await makePlayer(env);
    await api(ada).post('/friend-requests', { username: emeka.username });
    const back = await api(emeka).post('/friend-requests', { username: ada.username });
    expect(back.status).toBe(201);
    expect(back.body.data.request.status).toBe('accepted');
  });

  it('respects "allow friend requests: off" and can be declined or removed', async () => {
    const shy = await makePlayer(env, { privacy: { allowFriendRequests: false } });
    const ada = await makePlayer(env);
    const res = await api(ada).post('/friend-requests', { username: shy.username });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FRIEND_REQUESTS_CLOSED');

    const emeka = await makePlayer(env);
    const sent = await api(ada).post('/friend-requests', { username: emeka.username });
    expect((await api(emeka).del(`/friend-requests/${sent.body.data.request._id}`)).status).toBe(
      204,
    );
    await befriend(ada, emeka);
    expect((await api(ada).del(`/friends/${emeka.player._id}`)).status).toBe(204);
    expect((await api(emeka).get('/friends')).body.data.friends).toHaveLength(0);
  });
});

describe('blocking and muting', () => {
  it('blocking ends the friendship, hides profiles and search, and looks like a closed inbox', async () => {
    const ada = await makePlayer(env, { username: 'ada_lagos' });
    const troll = await makePlayer(env, { username: 'ada_troll' });
    await befriend(ada, troll);

    expect((await api(ada).post('/blocks', { playerId: String(troll.player._id) })).status).toBe(
      201,
    );
    expect((await api(ada).get('/friends')).body.data.friends).toHaveLength(0);
    expect((await api(troll).get(`/players/${ada.username}`)).status).toBe(404);
    expect(
      (await api(troll).get('/players?q=ada')).body.data.players.map((el) => el.username),
    ).not.toContain('ada_lagos');

    const retry = await api(troll).post('/friend-requests', { username: ada.username });
    expect(retry.status).toBe(403);
    expect(retry.body.error.code).toBe('FRIEND_REQUESTS_CLOSED');

    expect((await api(ada).get('/relations')).body.data.blocked).toHaveLength(1);
    expect((await api(ada).del(`/blocks/${troll.player._id}`)).status).toBe(204);
    expect((await api(troll).get(`/players/${ada.username}`)).status).toBe(200);
  });

  it('mutes are listed separately and cannot target yourself', async () => {
    const ada = await makePlayer(env);
    const loud = await makePlayer(env);
    expect(
      (await api(ada).post('/mutes', { playerId: String(loud.player._id) })).body.data.muted,
    ).toHaveLength(1);
    expect((await api(ada).post('/mutes', { playerId: String(ada.player._id) })).status).toBe(400);
  });
});

describe('profiles and privacy', () => {
  it('shows a public profile with university and level, never contact details', async () => {
    const ada = await makePlayer(env, { universitySlug: 'unilag', level: 200 });
    const viewer = await makePlayer(env);
    const res = await api(viewer).get(`/players/${ada.username}`);
    expect(res.status).toBe(200);
    expect(res.body.data.profile).toMatchObject({
      private: false,
      level: 200,
      university: { shortName: 'UNILAG' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/example\.test|matric|email/i);
  });

  it('a friends-only profile is private to strangers but visible to friends', async () => {
    const ada = await makePlayer(env, { privacy: { profileVisibility: 'friends' } });
    const stranger = await makePlayer(env);
    const friend = await makePlayer(env);
    await befriend(friend, ada);
    expect((await api(stranger).get(`/players/${ada.username}`)).body.data.profile.private).toBe(
      true,
    );
    expect((await api(friend).get(`/players/${ada.username}`)).body.data.profile.private).toBe(
      false,
    );
  });

  it('updates privacy settings with validation', async () => {
    const ada = await makePlayer(env);
    const res = await api(ada).patch('/privacy', { messagesFrom: 'everyone', showOnline: false });
    expect(res.status).toBe(200);
    expect(res.body.data.privacy).toMatchObject({ messagesFrom: 'everyone', showOnline: false });
    expect((await api(ada).patch('/privacy', { messagesFrom: 'aliens' })).status).toBe(400);
    expect((await api(ada).patch('/privacy', {})).status).toBe(400);
  });
});
