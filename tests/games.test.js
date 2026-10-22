import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import { occurrences } from '../src/modules/games/schedule.js';
import {
  Challenge,
  CommunityGroup,
  Competition,
  CompetitionEntry,
  EconomySettings,
  Friendship,
  GameAward,
  GameSession,
  GameStat,
  LedgerEntry,
  Player,
  StudentRecord,
  University,
  User,
  Wallet,
} from '../src/modules/models.js';

const PACK = JSON.parse(
  readFileSync(new URL('../data/games/unilag.json', import.meta.url), 'utf8'),
);
const BANK = new Map(PACK.content.trivia.content.questions.map((q) => [q.id, q]));
const { app, env } = buildTestApp();

let unilag;
beforeAll(async () => {
  await connectTestDb();
  await importSeeds();
  unilag = await University.findOne({ slug: 'unilag' });
});
afterAll(closeTestDb);
beforeEach(async () => {
  await Promise.all(
    [
      User,
      Player,
      StudentRecord,
      Wallet,
      LedgerEntry,
      GameSession,
      Challenge,
      GameStat,
      Competition,
      CompetitionEntry,
      GameAward,
      Friendship,
      CommunityGroup,
    ].map((M) => M.collection.deleteMany({})),
  );
  await EconomySettings.updateOne({ key: 'global' }, { $set: { 'rules.dailyGamePrizeCap': 150 } });
});

const games = (who) => ({
  get: (url) => request(app).get(`/api/v1/games${url}`).set(who.auth),
  post: (url, body) => request(app).post(`/api/v1/games${url}`).set(who.auth).send(body),
});
const student = (opts) => makePlayer(env, { universitySlug: 'unilag', ...opts });
// one right answer, the rest wrong (a low but non-zero score)
const oneRight = (view) => ({
  answers: Object.fromEntries(
    view.questions.map((q, i) => [
      q.id,
      i === 0 ? BANK.get(q.id).correct : q.options.find((o) => o.id !== BANK.get(q.id).correct).id,
    ]),
  ),
});
const perfectTrivia = (view) => ({
  answers: Object.fromEntries(view.questions.map((q) => [q.id, BANK.get(q.id).correct])),
});
const wrongTrivia = (view) => ({
  answers: Object.fromEntries(
    view.questions.map((q) => [q.id, q.options.find((o) => o.id !== BANK.get(q.id).correct).id]),
  ),
});

async function playTrivia(who, start, answerFn = perfectTrivia) {
  const started = await start;
  expect([200, 201]).toContain(started.status);
  const { session, view } = started.body.data;
  return games(who).post(`/sessions/${session.id}/submit`, { answer: answerFn(view) });
}

async function befriend(a, b) {
  const sent = await request(app)
    .post('/api/v1/social/friend-requests')
    .set(a.auth)
    .send({ username: b.username });
  await request(app)
    .post(`/api/v1/social/friend-requests/${sent.body.data.request._id}/accept`)
    .set(b.auth);
}

describe('catalogue', () => {
  it('lists playable games and the planned ones with an honest scope', async () => {
    const me = await student();
    const list = (await games(me).get('/')).body.data.games;
    expect(list.filter((g) => g.implemented).map((g) => g.key)).toEqual(['trivia', 'penalties']);
    const planned = list.filter((g) => !g.implemented).map((g) => g.key);
    expect(planned).toEqual(
      expect.arrayContaining([
        'chess',
        'ludo',
        'tennis',
        'table-tennis',
        'basketball',
        'debate',
        'dance',
        'football-match',
      ]),
    );
    expect(list.find((g) => g.key === 'chess').scope).toMatch(/validated on the server/);
  });

  it('needs a university', async () => {
    const outsider = await makePlayer(env);
    expect((await games(outsider).post('/sessions', { type: 'trivia' })).body.error.code).toBe(
      'NOT_ENROLLED',
    );
  });
});

describe('solo play', () => {
  it('trivia: no answers in the view, scored on the server, paid once, stats kept', async () => {
    const me = await student();
    const started = await games(me).post('/sessions', { type: 'trivia' });
    expect(started.status).toBe(201);
    expect(started.body.data.view.questions).toHaveLength(7);
    expect(JSON.stringify(started.body.data.view)).not.toMatch(/"correct"/);

    const { session, view } = started.body.data;
    const res = await games(me).post(`/sessions/${session.id}/submit`, {
      answer: perfectTrivia(view),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toMatchObject({ perfect: true, correct: 7 });
    expect(res.body.data.result.score).toBeGreaterThanOrEqual(700);
    expect(res.body.data.session.coins).toBe(Math.floor(res.body.data.result.score / 30));
    expect(res.body.data.achievementsEarned.map((a) => a.key)).toEqual(
      expect.arrayContaining(['first-game', 'flawless-game']),
    );

    // can't be submitted twice or re-scored
    expect(
      (await games(me).post(`/sessions/${session.id}/submit`, { answer: perfectTrivia(view) })).body
        .error.code,
    ).toBe('GAME_CLOSED');
    expect(await LedgerEntry.countDocuments({ player: me.player._id, kind: 'prize' })).toBe(1);
    const stat = await GameStat.findOne({ player: me.player._id, type: 'trivia' });
    expect(stat).toMatchObject({ played: 1, perfects: 1, best: res.body.data.result.score });
  });

  it('expired games score nothing, and casual coins are capped per day', async () => {
    const me = await student();
    const s = (await games(me).post('/sessions', { type: 'trivia' })).body.data;
    await GameSession.updateOne(
      { _id: s.session.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect(
      (await games(me).post(`/sessions/${s.session.id}/submit`, { answer: perfectTrivia(s.view) }))
        .body.error.code,
    ).toBe('GAME_EXPIRED');

    await EconomySettings.updateOne({ key: 'global' }, { $set: { 'rules.dailyGamePrizeCap': 40 } });
    await playTrivia(me, games(me).post('/sessions', { type: 'trivia' }));
    await playTrivia(me, games(me).post('/sessions', { type: 'trivia' }));
    const paid = await LedgerEntry.aggregate([
      { $match: { player: me.player._id, kind: 'prize' } },
      { $group: { _id: null, t: { $sum: '$amount' } } },
    ]);
    expect(paid[0].t).toBe(40);
  });

  it('penalties: the keeper is decided on the server; the client only picks shots', async () => {
    const me = await student();
    const s = (await games(me).post('/sessions', { type: 'penalties' })).body.data;
    expect(s.view).toEqual({
      kicks: 5,
      directions: ['left', 'centre', 'right'],
      heights: ['low', 'high'],
    });
    const bad = await games(me).post(`/sessions/${s.session.id}/submit`, {
      answer: { kicks: [{ direction: 'left', height: 'low' }], keeper: 'none' },
    });
    expect(bad.status).toBe(400);
    const kicks = Array.from({ length: 5 }, () => ({ direction: 'left', height: 'low' }));
    const res = await games(me).post(`/sessions/${s.session.id}/submit`, { answer: { kicks } });
    expect(res.body.data.result.goals).toBeGreaterThanOrEqual(0);
    expect(res.body.data.result.goals).toBeLessThanOrEqual(5);
    res.body.data.result.details.forEach((d) =>
      expect(['goal', 'saved', 'over']).toContain(d.outcome),
    );
    // same seed → same keeper: replaying the scoring with the stored secret gives the same result
    const stored = await GameSession.findById(s.session.id).select('+secret');
    const saves = stored.secret.keeper.filter((k) => k.dive === 'left').length;
    expect(res.body.data.result.goals).toBe(5 - saves);
  });
});

describe('duels', () => {
  it('friend challenge: accept → both play the same questions → higher score wins, Elo moves, winner paid once', async () => {
    const a = await student();
    const b = await student();
    expect(
      (await games(a).post('/challenges', { type: 'trivia', opponentId: String(b.player._id) }))
        .body.error.code,
    ).toBe('CHALLENGE_NOT_ALLOWED');
    await befriend(a, b);
    const created = await games(a).post('/challenges', {
      type: 'trivia',
      opponentId: String(b.player._id),
    });
    const id = created.body.data.challenge.id;
    expect((await games(b).post(`/challenges/${id}/play`)).body.error.code).toBe(
      'CHALLENGE_NOT_ACCEPTED',
    );
    expect((await games(b).post(`/challenges/${id}/accept`)).body.data.challenge.status).toBe(
      'ready',
    );

    const playA = await games(a).post(`/challenges/${id}/play`);
    const playB = await games(b).post(`/challenges/${id}/play`);
    expect(playA.body.data.view.questions.map((q) => q.id)).toEqual(
      playB.body.data.view.questions.map((q) => q.id),
    );

    const resA = await games(a).post(`/sessions/${playA.body.data.session.id}/submit`, {
      answer: perfectTrivia(playA.body.data.view),
    });
    expect(resA.body.data.duel).toEqual({ waiting: true });
    // B's view of the duel doesn't reveal A's score yet
    expect((await games(b).get('/challenges')).body.data.challenges[0].theirResult).toBeNull();
    const resB = await games(b).post(`/sessions/${playB.body.data.session.id}/submit`, {
      answer: wrongTrivia(playB.body.data.view),
    });
    expect(resB.body.data.duel).toMatchObject({ waiting: false, youWon: false });

    const final = (await games(a).get('/challenges')).body.data.challenges[0];
    expect(final).toMatchObject({ status: 'finished', youWon: true, draw: false });
    const [sa, sb] = await Promise.all([
      GameStat.findOne({ player: a.player._id }),
      GameStat.findOne({ player: b.player._id }),
    ]);
    expect(sa).toMatchObject({ wins: 1, rating: 1216 });
    expect(sb).toMatchObject({ losses: 1, rating: 1184 });
    expect(await LedgerEntry.countDocuments({ idempotencyKey: `duel:${id}:${a.player._id}` })).toBe(
      1,
    );
    expect((await games(a).post(`/challenges/${id}/play`)).body.error.code).toBe(
      'CHALLENGE_CLOSED',
    );
  });

  it('quick match pairs two players waiting for the same game', async () => {
    const a = await student();
    const b = await student();
    const first = await games(a).post('/challenges', { type: 'penalties' });
    expect(first.body.data.matched).toBe(false);
    const second = await games(b).post('/challenges', { type: 'penalties' });
    expect(second.body.data).toMatchObject({ matched: true });
    expect(second.body.data.challenge.id).toBe(first.body.data.challenge.id);
    expect(second.body.data.challenge.status).toBe('ready');
  });
});

describe('leaderboards', () => {
  it('ranks players by best score, with my own rank', async () => {
    const a = await student();
    const b = await student();
    await playTrivia(a, games(a).post('/sessions', { type: 'trivia' }), perfectTrivia);
    await playTrivia(b, games(b).post('/sessions', { type: 'trivia' }), wrongTrivia);
    const board = (await games(b).get('/leaderboards/trivia?metric=best')).body.data.leaderboard;
    expect(board.entries.map((e) => e.username)).toEqual([a.username, b.username]);
    expect(board.me.rank).toBe(2);
  });
});

describe('campus competitions', () => {
  const live = (fields = {}) =>
    Competition.create({
      university: unilag._id,
      key: `test:${Math.random()}`,
      title: 'Test Trivia Cup',
      type: 'trivia',
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 3_600_000),
      maxAttempts: 2,
      rewards: [
        { rank: 1, coins: 300 },
        { rank: 2, coins: 150 },
      ],
      ...fields,
    });

  it('scheduled events appear automatically (e.g. the daily trivia challenge is live today)', async () => {
    const me = await student();
    const list = (await games(me).get('/competitions')).body.data.competitions;
    expect(list.some((c) => c.title === 'Daily Trivia Challenge' && c.phase === 'live')).toBe(true);
    expect(list.some((c) => c.title === 'Friday Trivia Night')).toBe(true);
  });

  it('weekly schedules use the university timezone (Friday 18:00 in Lagos = 17:00 UTC)', () => {
    const friday = occurrences(
      PACK.schedules[0],
      'Africa/Lagos',
      new Date('2026-10-21T12:00:00Z'),
    ).find((o) => o.key.endsWith('2026-10-23'));
    expect(friday.startsAt.toISOString()).toBe('2026-10-23T17:00:00.000Z');
    expect(friday.endsAt.toISOString()).toBe('2026-10-23T20:00:00.000Z');
  });

  it('best score counts, attempts are limited, prizes are paid once at the end', async () => {
    const comp = await live();
    const a = await student();
    const b = await student();
    await playTrivia(a, games(a).post(`/competitions/${comp._id}/play`), perfectTrivia);
    await playTrivia(b, games(b).post(`/competitions/${comp._id}/play`), oneRight);
    await playTrivia(b, games(b).post(`/competitions/${comp._id}/play`), oneRight);
    expect((await games(b).post(`/competitions/${comp._id}/play`)).body.error.code).toBe(
      'NO_ATTEMPTS_LEFT',
    );
    // competition play pays nothing until the end
    expect(await LedgerEntry.countDocuments({ kind: 'prize', 'ref.type': 'competition' })).toBe(0);

    await Competition.updateOne(
      { _id: comp._id },
      { $set: { endsAt: new Date(Date.now() - 1000) } },
    );
    const [first, second] = await Promise.all([
      games(a).get(`/competitions/${comp._id}`),
      games(b).get(`/competitions/${comp._id}`),
    ]);
    expect(first.body.data.competition.phase).toBe('finished');
    expect(second.body.data.competition.standings.map((s) => s.username)).toEqual([
      a.username,
      b.username,
    ]);
    await games(a).get('/competitions'); // finalizing again must not pay again
    const prizes = await LedgerEntry.find({ 'ref.type': 'competition' });
    expect(prizes.map((p) => p.amount).sort()).toEqual([150, 300]);
    expect(await GameAward.exists({ player: a.player._id, key: 'podium' })).toBeTruthy();
  });

  it('team events: play for your group; the best members count', async () => {
    const comp = await live({
      type: 'trivia',
      teams: 'groups',
      teamSize: 2,
      rewards: [{ rank: 1, coins: 100 }],
    });
    const a = await student();
    const b = await student();
    const outsider = await student();
    const group = await CommunityGroup.create({
      university: unilag._id,
      name: 'Quiz Crew',
      owner: a.player._id,
      members: [{ player: a.player._id, role: 'owner' }, { player: b.player._id }],
    });
    expect((await games(a).post(`/competitions/${comp._id}/play`)).body.error.code).toBe(
      'NOT_ENTERED',
    );
    expect(
      (
        await games(outsider).post(`/competitions/${comp._id}/entries`, {
          groupId: String(group._id),
        })
      ).status,
    ).toBe(403);
    for (const p of [a, b]) {
      // eslint-disable-next-line no-await-in-loop
      await games(p).post(`/competitions/${comp._id}/entries`, { groupId: String(group._id) });
      // eslint-disable-next-line no-await-in-loop
      await playTrivia(p, games(p).post(`/competitions/${comp._id}/play`));
    }
    const view = (await games(a).get(`/competitions/${comp._id}`)).body.data.competition;
    expect(view.standings[0]).toMatchObject({ rank: 1, name: 'Quiz Crew' });
    const entries = await CompetitionEntry.find({ competition: comp._id });
    expect(view.standings[0].score).toBe(entries.reduce((s, e) => s + e.best, 0));

    await Competition.updateOne(
      { _id: comp._id },
      { $set: { endsAt: new Date(Date.now() - 1000) } },
    );
    await games(a).get('/competitions');
    expect(await LedgerEntry.countDocuments({ 'ref.type': 'competition', amount: 100 })).toBe(2); // both members
  });
});
