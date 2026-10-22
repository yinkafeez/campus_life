import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { bus, EVENTS } from '../src/core/events.js';
import { filterText, createRateLimiter } from '../src/modules/moderation/textFilter.js';
import { rememberChat } from '../src/modules/moderation/chatLog.js';
import {
  Conversation,
  Friendship,
  Message,
  Player,
  PlayerRelation,
  Report,
  User,
} from '../src/modules/models.js';

const ADMIN_KEY = 'test-only-admin-key-0123456789abcdef0123';
const { app, env } = buildTestApp({ ADMIN_API_KEY: ADMIN_KEY });

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await Promise.all(
    [User, Player, Friendship, PlayerRelation, Conversation, Message, Report].map((M) =>
      M.deleteMany({}),
    ),
  );
});

const msg = (who) => ({
  get: (url) => request(app).get(`/api/v1/messages${url}`).set(who.auth),
  post: (url, body) => request(app).post(`/api/v1/messages${url}`).set(who.auth).send(body),
});

async function befriend(a, b) {
  const sent = await request(app)
    .post('/api/v1/social/friend-requests')
    .set(a.auth)
    .send({ username: b.username });
  await request(app)
    .post(`/api/v1/social/friend-requests/${sent.body.data.request._id}/accept`)
    .set(b.auth);
}

async function openThread(a, b) {
  const res = await msg(a).post('/conversations/direct', { playerId: String(b.player._id) });
  return res;
}

describe('text filter', () => {
  it('masks blocked words as whole words only', () => {
    expect(filterText('you be mumu').text).toBe('you be m***');
    expect(filterText('the code works').text).toBe('the code works'); // "ode" inside a word is fine
  });

  it('hides contact details in public chat but not in private messages', () => {
    const raw = 'call me 08031234567 or mail ada@example.com, ig @ada.lagos';
    const pub = filterText(raw, { isPublic: true });
    expect(pub.text).not.toMatch(/0803|example\.com|ada\.lagos/);
    expect(pub.masked).toBe(true);
    expect(filterText(raw).text).toContain('08031234567');
  });

  it('strips control characters and caps length', () => {
    expect(filterText('hi\u0000\u0007 there').text).toBe('hi there');
    expect(filterText('a'.repeat(900)).text).toHaveLength(500);
  });

  it('rate limiter allows a burst then refuses', () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([allow('p', 0), allow('p', 1), allow('p', 2), allow('p', 1500)]).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });
});

describe('direct messages', () => {
  it('friends can message; the default "friends only" setting stops strangers', async () => {
    const ada = await makePlayer(env);
    const emeka = await makePlayer(env);
    const stranger = await makePlayer(env);

    const refused = await openThread(stranger, ada);
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('MESSAGING_NOT_ALLOWED');

    await befriend(ada, emeka);
    const thread = await openThread(ada, emeka);
    expect(thread.status).toBe(200);
    const id = thread.body.data.conversation.id;
    // opening again returns the same thread
    expect((await openThread(emeka, ada)).body.data.conversation.id).toBe(id);

    const pushed = [];
    const listener = (e) => pushed.push(e);
    bus.on(EVENTS.MESSAGE_SENT, listener);
    const sent = await msg(ada).post(`/conversations/${id}/messages`, {
      text: 'How far? You dey come 2001 later?',
    });
    bus.off(EVENTS.MESSAGE_SENT, listener);
    expect(sent.status).toBe(201);
    expect(pushed[0].toPlayerIds).toEqual([String(emeka.player._id)]);

    const inbox = await msg(emeka).get('/conversations');
    expect(inbox.body.data.conversations[0]).toMatchObject({
      unread: true,
      with: { username: ada.username },
    });
    expect((await msg(emeka).post(`/conversations/${id}/read`)).status).toBe(204);
    expect((await msg(emeka).get('/conversations')).body.data.conversations[0].unread).toBe(false);
  });

  it('"everyone" lets strangers write, and the other player may reply even if their own setting is stricter', async () => {
    const open = await makePlayer(env, { privacy: { messagesFrom: 'everyone' } });
    const stranger = await makePlayer(env); // default: friends only
    const thread = await openThread(stranger, open);
    expect(thread.status).toBe(200);
    const id = thread.body.data.conversation.id;
    expect(
      (
        await msg(stranger).post(`/conversations/${id}/messages`, {
          text: 'Hello, which way to Jaja?',
        })
      ).status,
    ).toBe(201);
    expect(
      (await msg(open).post(`/conversations/${id}/messages`, { text: 'Go straight past Senate.' }))
        .status,
    ).toBe(201);
  });

  it('blocking stops messages both ways and hides the thread', async () => {
    const ada = await makePlayer(env);
    const emeka = await makePlayer(env);
    await befriend(ada, emeka);
    const id = (await openThread(ada, emeka)).body.data.conversation.id;
    await msg(ada).post(`/conversations/${id}/messages`, { text: 'hi' });

    await request(app)
      .post('/api/v1/social/blocks')
      .set(emeka.auth)
      .send({ playerId: String(ada.player._id) });
    expect((await msg(ada).post(`/conversations/${id}/messages`, { text: 'hello?' })).status).toBe(
      403,
    );
    expect((await msg(emeka).post(`/conversations/${id}/messages`, { text: 'bye' })).status).toBe(
      403,
    );
    expect((await msg(emeka).get('/conversations')).body.data.conversations).toHaveLength(0);
  });

  it('non-members cannot read a thread; messages paginate newest first', async () => {
    const ada = await makePlayer(env);
    const emeka = await makePlayer(env);
    const nosy = await makePlayer(env);
    await befriend(ada, emeka);
    const id = (await openThread(ada, emeka)).body.data.conversation.id;
    for (let i = 1; i <= 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- order matters
      await Message.create({ conversation: id, sender: ada.player._id, text: `line ${i}` });
    }
    expect((await msg(nosy).get(`/conversations/${id}/messages`)).status).toBe(404);

    const page1 = await msg(emeka).get(`/conversations/${id}/messages?limit=3`);
    expect(page1.body.data.messages.map((el) => el.text)).toEqual(['line 5', 'line 4', 'line 3']);
    expect(page1.body.data.hasMore).toBe(true);
    const oldest = page1.body.data.messages.at(-1).id;
    const page2 = await msg(emeka).get(`/conversations/${id}/messages?limit=3&before=${oldest}`);
    expect(page2.body.data.messages.map((el) => el.text)).toEqual(['line 2', 'line 1']);
    expect(page2.body.data.hasMore).toBe(false);
  });

  it('filters bad words in messages and refuses empty ones', async () => {
    const ada = await makePlayer(env);
    const emeka = await makePlayer(env);
    await befriend(ada, emeka);
    const id = (await openThread(ada, emeka)).body.data.conversation.id;
    const res = await msg(ada).post(`/conversations/${id}/messages`, { text: 'you be werey o' });
    expect(res.body.data.message).toMatchObject({ text: 'you be w**** o', masked: true });
    expect((await msg(ada).post(`/conversations/${id}/messages`, { text: '   ' })).status).toBe(
      400,
    );
  });
});

describe('reports and moderation', () => {
  it('a report quotes the real message (server-side evidence) and admins can pause chat', async () => {
    const ada = await makePlayer(env);
    const rude = await makePlayer(env);
    await befriend(ada, rude);
    const id = (await openThread(rude, ada)).body.data.conversation.id;
    const sent = await msg(rude).post(`/conversations/${id}/messages`, {
      text: 'send me your number now',
    });

    const report = await request(app)
      .post('/api/v1/reports')
      .set(ada.auth)
      .send({
        targetId: String(rude.player._id),
        context: 'message',
        reason: 'harassment',
        messageId: sent.body.data.message.id,
      });
    expect(report.status).toBe(201);
    expect(report.body.data.report).not.toHaveProperty('evidence'); // reporter only sees a receipt

    const dup = await request(app)
      .post('/api/v1/reports')
      .set(ada.auth)
      .send({
        targetId: String(rude.player._id),
        context: 'message',
        reason: 'harassment',
        messageId: sent.body.data.message.id,
      });
    expect(dup.status).toBe(409);

    const list = await request(app).get('/api/v1/admin/reports').set('X-Admin-Key', ADMIN_KEY);
    expect(list.status).toBe(200);
    expect(list.body.data.reports[0].evidence.text).toBe('send me your number now');
    expect(list.body.data.reports[0].target.username).toBe(rude.username);

    expect((await request(app).get('/api/v1/admin/reports').set(ada.auth)).status).toBe(403);

    const notices = [];
    const listener = (e) => notices.push(e);
    bus.on(EVENTS.MODERATION_ACTION, listener);
    const resolved = await request(app)
      .patch(`/api/v1/admin/reports/${report.body.data.report.id}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ action: 'mute-chat', durationHours: 24, note: 'First offence' });
    bus.off(EVENTS.MODERATION_ACTION, listener);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.report.status).toBe('actioned');
    expect(notices[0]).toMatchObject({ toPlayerId: String(rude.player._id), action: 'mute-chat' });

    const muted = await msg(rude).post(`/conversations/${id}/messages`, { text: 'hello' });
    expect(muted.status).toBe(403);
    expect(muted.body.error.code).toBe('CHAT_MUTED');
  });

  it("a report cannot quote someone else's message or a message from a thread you are not in", async () => {
    const ada = await makePlayer(env);
    const emeka = await makePlayer(env);
    const outsider = await makePlayer(env);
    await befriend(ada, emeka);
    const id = (await openThread(ada, emeka)).body.data.conversation.id;
    const sent = await msg(ada).post(`/conversations/${id}/messages`, { text: 'private' });
    const res = await request(app)
      .post('/api/v1/reports')
      .set(outsider.auth)
      .send({
        targetId: String(ada.player._id),
        context: 'message',
        reason: 'spam',
        messageId: sent.body.data.message.id,
      });
    expect(res.status).toBe(404);
  });

  it('zone chat reports quote the remembered line', async () => {
    const ada = await makePlayer(env);
    const loud = await makePlayer(env);
    const line = rememberChat({
      sender: loud.player._id,
      zoneRoom: 'zone:x:y',
      text: 'buy my fake result',
    });
    const res = await request(app)
      .post('/api/v1/reports')
      .set(ada.auth)
      .send({
        targetId: String(loud.player._id),
        context: 'chat',
        reason: 'scam',
        chatId: line.id,
      });
    expect(res.status).toBe(201);
    expect((await Report.findOne()).evidence.text).toBe('buy my fake result');
  });

  it('suspending an account locks it out of the API', async () => {
    const ada = await makePlayer(env);
    const bad = await makePlayer(env);
    const report = await request(app)
      .post('/api/v1/reports')
      .set(ada.auth)
      .send({
        targetId: String(bad.player._id),
        context: 'profile',
        reason: 'impersonation',
        details: 'Pretends to be a lecturer',
      });
    await request(app)
      .patch(`/api/v1/admin/reports/${report.body.data.report.id}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ action: 'suspend', durationHours: 48 });
    const res = await request(app).get('/api/v1/social/friends').set(bad.auth);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('mute-chat and suspend need a duration; dismissing works', async () => {
    const ada = await makePlayer(env);
    const other = await makePlayer(env);
    const report = await request(app)
      .post('/api/v1/reports')
      .set(ada.auth)
      .send({ targetId: String(other.player._id), context: 'profile', reason: 'other' });
    const id = report.body.data.report.id;
    expect(
      (
        await request(app)
          .patch(`/api/v1/admin/reports/${id}`)
          .set('X-Admin-Key', ADMIN_KEY)
          .send({ action: 'suspend' })
      ).status,
    ).toBe(400);
    const dismissed = await request(app)
      .patch(`/api/v1/admin/reports/${id}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ action: 'none' });
    expect(dismissed.body.data.report.status).toBe('dismissed');
  });
});
