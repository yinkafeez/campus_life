import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import { ENGINES } from '../src/modules/learning/engines/index.js';
import { seededRandom } from '../src/modules/learning/engines/shared.js';
import { validatePack } from '../src/modules/learning/pack/validatePack.js';
import { importPack } from '../src/modules/learning/pack/importPack.js';
import {
  ActivityAttempt,
  ActivityLog,
  Discovery,
  LearningActivity,
  LearningProgress,
  Player,
  StudentRecord,
  University,
  User,
} from '../src/modules/models.js';

const PACK = JSON.parse(
  readFileSync(new URL('../data/learning/unilag.json', import.meta.url), 'utf8'),
);
const ADMIN_KEY = 'test-only-admin-key-0123456789abcdef0123';
const { app, env } = buildTestApp({ ADMIN_API_KEY: ADMIN_KEY });
const clone = (v) => JSON.parse(JSON.stringify(v));
const byKey = (key) => PACK.activities.find((a) => a.key === key);

beforeAll(async () => {
  await connectTestDb();
  await importSeeds(); // UNILAG bundle + learning pack
});
afterAll(closeTestDb);
beforeEach(async () => {
  await Promise.all(
    [User, Player, StudentRecord, ActivityAttempt, LearningProgress, Discovery, ActivityLog].map(
      (M) => M.deleteMany({}),
    ),
  );
});

const learn = (who) => ({
  get: (url) => request(app).get(`/api/v1/learning${url}`).set(who.auth),
  post: (url, body) => request(app).post(`/api/v1/learning${url}`).set(who.auth).send(body),
});
const student = (opts = {}) =>
  makePlayer(env, { universitySlug: 'unilag', programmeCode: 'CSC', ...opts });

/** The right answer for an activity, built from the pack + what the player was shown. */
function perfectAnswer(activity, view) {
  const c = activity.content;
  if (activity.engine === 'quiz')
    return { answers: Object.fromEntries(c.questions.map((q) => [q.id, q.correct])) };
  if (activity.engine === 'ordering') return { order: c.items.map((i) => i.id) };
  if (activity.engine === 'scenario') {
    return {
      choices: Object.fromEntries(
        c.steps.map((s) => [s.id, [...s.choices].sort((a, b) => b.points - a.points)[0].id]),
      ),
    };
  }
  if (activity.engine === 'matching') {
    return {
      matches: Object.fromEntries(
        c.pairs.map((p) => [p.id, view.right.find((r) => r.text === p.right).id]),
      ),
    };
  }
  return { text: c.modelAnswer };
}

async function pass(who, key) {
  const started = await learn(who).post(`/activities/${key}/attempts`);
  expect([200, 201]).toContain(started.status);
  const res = await learn(who).post(`/attempts/${started.body.data.attempt.id}/submit`, {
    answer: perfectAnswer(byKey(key), started.body.data.view),
  });
  expect(res.status).toBe(200);
  return res.body.data;
}

describe('activity engines', () => {
  const rand = () => seededRandom(42);

  it('never put answers in what the player sees', () => {
    PACK.activities.forEach((activity) => {
      const content = ENGINES[activity.engine].contentSchema.parse(activity.content);
      const { view } = ENGINES[activity.engine].present(content, rand());
      const shown = JSON.stringify(view);
      expect(shown).not.toMatch(/"correct"|"keywords"|modelAnswer|explanation|"feedback"/);
      // rubric weights are public for written work; choice points never are
      if (activity.engine !== 'written') expect(shown).not.toMatch(/"points"/);
    });
  });

  it('scores each format on the server', () => {
    const quiz = ENGINES.quiz.contentSchema.parse(byKey('eee-circuit-basics').content);
    expect(ENGINES.quiz.score(quiz, { answers: { q1: 'a', q2: 'a', q3: 'a' } }).score).toBe(2);

    const order = ENGINES.ordering.contentSchema.parse(byKey('med-primary-survey').content);
    expect(
      ENGINES.ordering.score(order, {
        order: ['airway', 'breathing', 'circulation', 'disability', 'exposure'],
      }).score,
    ).toBe(5);
    expect(ENGINES.ordering.present(order, rand()).view.items.map((i) => i.id)).not.toEqual(
      order.items.map((i) => i.id),
    );

    const match = ENGINES.matching.contentSchema.parse(byKey('mth-notation').content);
    const shown = ENGINES.matching.present(match, rand());
    // ids on the right side are opaque tokens, not pair ids
    expect(
      shown.view.right.map((r) => r.id).some((id) => match.pairs.some((p) => p.id === id)),
    ).toBe(false);
    const all = Object.fromEntries(
      match.pairs.map((p) => [p.id, shown.view.right.find((r) => r.text === p.right).id]),
    );
    expect(ENGINES.matching.score(match, { matches: all }, shown.secret).score).toBe(
      match.pairs.length,
    );

    const written = ENGINES.written.contentSchema.parse(byKey('law-structured-debate').content);
    expect(ENGINES.written.score(written, { text: written.modelAnswer }).score).toBe(10);
    expect(ENGINES.written.score(written, { text: 'Too short.' }).lengthOk).toBe(false);
  });
});

describe('learning pack', () => {
  it('rejects bad engine content, unknown codes and unknown references', () => {
    const bad = clone(PACK);
    bad.activities[0].content.questions[0].correct = 'zzz';
    bad.activities[2].targets = { faculties: ['XYZ'] };
    bad.missions[0].steps[3].ref = 'no-such-activity';
    const catalogue = {
      faculties: new Set(['CIN']),
      departments: new Set(),
      programmes: new Set(),
      levels: [100],
      locations: new Map(),
      existingActivityKeys: new Set(),
    };
    const report = validatePack(bad, { catalogue });
    expect(report.valid).toBe(false);
    const messages = report.errors.map((e) => `${e.path} ${e.message}`).join('\n');
    expect(messages).toMatch(/correct must be one of the option ids/);
    expect(messages).toMatch(/Unknown faculty code "XYZ"/);
    expect(messages).toMatch(/Unknown activity "no-such-activity"/);
  });

  it('imports idempotently, via the admin API too', async () => {
    const again = await importPack(PACK);
    expect(again.results.LearningActivity).toMatchObject({ created: 0, updated: 0 });
    const res = await request(app)
      .post('/api/v1/admin/learning-packs/import?dryRun=true')
      .set('X-Admin-Key', ADMIN_KEY)
      .send(PACK);
    expect(res.status).toBe(200);
    expect(res.body.data.report.summary.activities).toBe(PACK.activities.length);
  });

  it('gives every programme at least three activities', async () => {
    const uni = await University.findOne({ slug: 'unilag' });
    const programmes = await StudentRecord.db.model('Programme').find({ university: uni._id });
    for (const programme of programmes) {
      // eslint-disable-next-line no-await-in-loop
      const p = await student({ programmeCode: programme.code });
      // eslint-disable-next-line no-await-in-loop
      const res = await learn(p).get('/activities');
      const own = res.body.data.activities.filter((a) => a.discipline !== 'General studies');
      expect(own.length, programme.code).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('activities for my programme', () => {
  it('a Computer Science fresher sees computing + general, not law or medicine', async () => {
    const me = await student();
    const res = await learn(me).get('/activities');
    expect(res.status).toBe(200);
    const keys = res.body.data.activities.map((a) => a.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'cs-predict-output',
        'cs-debug-grade-calculator',
        'library-research-skills',
      ]),
    );
    expect(keys).not.toContain('law-moot-court');
    expect(keys).not.toContain('med-physiology-basics');
    expect(keys).not.toContain('cs-security-scenario'); // 200L and up
    expect(JSON.stringify(res.body)).not.toMatch(/"correct"|"content"/);
  });

  it('medical students get medicine content with an educational notice', async () => {
    const me = await student({ programmeCode: 'MBBS' });
    const res = await learn(me).get('/activities');
    const med = res.body.data.activities.find((a) => a.key === 'med-clinical-case-fever');
    expect(med.notice).toMatch(/not clinical guidance/i);
  });

  it('is closed to players who are not studying yet', async () => {
    const outsider = await makePlayer(env);
    expect((await learn(outsider).get('/activities')).body.error.code).toBe('NOT_ENROLLED');
    const offered = await student({ status: 'offered' });
    expect((await learn(offered).get('/activities')).body.error.code).toBe('NOT_MATRICULATED');
    const law = await learn(await student()).get('/activities/law-moot-court');
    expect(law.status).toBe(404);
  });
});

describe('attempts, scoring and results', () => {
  it('start → submit → XP for a pass, results kept; the same attempt cannot be scored twice', async () => {
    const me = await student();
    const started = await learn(me).post('/activities/cs-predict-output/attempts');
    expect(started.status).toBe(201);
    expect(started.body.data.view.questions).toHaveLength(4);
    // resuming returns the same attempt with the same shuffled view
    const resumed = await learn(me).post('/activities/cs-predict-output/attempts');
    expect(resumed.body.data.attempt.id).toBe(started.body.data.attempt.id);
    expect(resumed.body.data.view).toEqual(started.body.data.view);

    const id = started.body.data.attempt.id;
    const answer = perfectAnswer(byKey('cs-predict-output'), started.body.data.view);
    const res = await learn(me).post(`/attempts/${id}/submit`, { answer });
    expect(res.body.data.result).toMatchObject({ percent: 100, passed: true, xpAwarded: 50 }); // easy × 1
    expect(res.body.data.result.feedback[0]).toHaveProperty('explanation');
    expect(res.body.data.achievementsEarned.map((a) => a.key)).toEqual(
      expect.arrayContaining(['first-pass', 'flawless']),
    );

    expect((await learn(me).post(`/attempts/${id}/submit`, { answer })).body.error.code).toBe(
      'ATTEMPT_CLOSED',
    );

    // the result is retained
    const detail = await learn(me).get('/activities/cs-predict-output');
    expect(detail.body.data.activity.state.best).toMatchObject({ percent: 100, passed: true });
    expect(detail.body.data.attempts).toHaveLength(1);
    expect((await learn(me).get('/attempts')).body.data.attempts[0].title).toBe(
      'Predict the output',
    );
  });

  it('only improvements earn XP, failures earn none, and attempts run out', async () => {
    const me = await student();
    const key = 'cs-debug-grade-calculator'; // medium (×1.5), 3 attempts, pass 60%
    const wrong = { answers: { q1: 'b', q2: 'b', q3: 'b' } };
    const run = async (answer) => {
      const s = await learn(me).post(`/activities/${key}/attempts`);
      return (await learn(me).post(`/attempts/${s.body.data.attempt.id}/submit`, { answer })).body
        .data.result;
    };
    expect(await run(wrong)).toMatchObject({ passed: false, xpAwarded: 0 });
    const first = await run({ answers: { q1: 'a', q2: 'a', q3: 'b' } }); // 67%
    expect(first).toMatchObject({ passed: true, xpAwarded: Math.round(60 * 1.5 * 0.67) });
    const full = await run({ answers: { q1: 'a', q2: 'a', q3: 'a' } });
    expect(full.xpAwarded).toBe(90 - first.xpAwarded); // only the improvement
    const out = await learn(me).post(`/activities/${key}/attempts`);
    expect(out.body.error.code).toBe('NO_ATTEMPTS_LEFT');
    const progress = await LearningProgress.findOne({ player: me.player._id });
    expect(progress.totalXp).toBe(90);
  });

  it('rejects late submissions after the time limit and malformed answers', async () => {
    const me = await student();
    const s = await learn(me).post('/activities/cs-predict-output/attempts');
    const id = s.body.data.attempt.id;
    expect(
      (await learn(me).post(`/attempts/${id}/submit`, { answer: { nope: true } })).status,
    ).toBe(400);
    await ActivityAttempt.updateOne(
      { _id: id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect(
      (await learn(me).post(`/attempts/${id}/submit`, { answer: { answers: {} } })).body.error.code,
    ).toBe('ATTEMPT_EXPIRED');
    // the expired attempt counts as used
    const next = await learn(me).post('/activities/cs-predict-output/attempts');
    expect(next.body.data.attempt.number).toBe(2);
  });

  it('applies the late penalty after the due date', async () => {
    const me = await student();
    await learn(me).get('/standing'); // creates the level entry
    await LearningProgress.updateOne(
      { player: me.player._id, 'levels.level': 100 },
      { $set: { 'levels.$.startedAt': new Date(Date.now() - 10 * 86_400_000) } },
    );
    const detail = await learn(me).get('/activities/fresher-study-plan'); // due 7 days after the level starts
    expect(detail.body.data.activity.state.late).toBe(true);
    const result = await pass(me, 'fresher-study-plan');
    expect(result.result).toMatchObject({ late: true, xpAwarded: 20 }); // 40 × 50%
  });

  it("another player's attempt is not mine to submit", async () => {
    const a = await student();
    const b = await student();
    const s = await learn(a).post('/activities/cs-predict-output/attempts');
    expect(
      (
        await learn(b).post(`/attempts/${s.body.data.attempt.id}/submit`, {
          answer: { answers: {} },
        })
      ).status,
    ).toBe(404);
  });
});

describe('missions and promotion', () => {
  it('departmental week completes after three passes and pays its XP once', async () => {
    const me = await student();
    await pass(me, 'cs-predict-output');
    await pass(me, 'cs-design-hostel-booking');
    const third = await pass(me, 'cs-debug-grade-calculator');
    expect(third.missionsCompleted.map((m) => m.key)).toContain('departmental-week');
    const missions = (await learn(me).get('/missions')).body.data.missions;
    expect(missions.find((m) => m.key === 'departmental-week')).toMatchObject({ complete: true });
    const progress = await LearningProgress.findOne({ player: me.player._id });
    expect(progress.missionsCompleted.filter((m) => m.key === 'departmental-week')).toHaveLength(1);
  });

  it('fresher week mission follows the campus world (discoveries + campus activity)', async () => {
    const me = await student();
    await pass(me, 'library-research-skills');
    let mission = (await learn(me).get('/missions')).body.data.missions.find(
      (m) => m.key === 'fresher-first-week',
    );
    expect(mission.steps.filter((s) => s.done).map((s) => s.key)).toEqual(['research-skills']);
    await request(app)
      .post('/api/v1/campus/discoveries')
      .set(me.auth)
      .send({ locationSlug: 'university-library' });
    await request(app)
      .post('/api/v1/campus/discoveries')
      .set(me.auth)
      .send({ locationSlug: '2001-cafeteria' });
    await request(app)
      .post('/api/v1/campus/activities')
      .set(me.auth)
      .send({ locationSlug: 'university-library', activityKey: 'study' });
    mission = (await learn(me).get('/missions')).body.data.missions.find(
      (m) => m.key === 'fresher-first-week',
    );
    expect(mission.complete).toBe(true);
  });

  it('promotion is refused until every rule is met, then moves 100L → 200L', async () => {
    const me = await student({ onboarded: true });
    const refused = await learn(me).post('/progression/advance');
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('REQUIREMENTS_NOT_MET');
    expect(refused.body.error.details.map((d) => d.key)).toEqual(
      expect.arrayContaining([
        'xp',
        'passed',
        'mission:fresher-first-week',
        'mission:departmental-week',
      ]),
    );

    // meet the rules: fresher week + three passes (+ XP from both)
    await request(app)
      .post('/api/v1/campus/discoveries')
      .set(me.auth)
      .send({ locationSlug: 'university-library' });
    await request(app)
      .post('/api/v1/campus/discoveries')
      .set(me.auth)
      .send({ locationSlug: '2001-cafeteria' });
    await request(app)
      .post('/api/v1/campus/activities')
      .set(me.auth)
      .send({ locationSlug: 'university-library', activityKey: 'study' });
    await pass(me, 'library-research-skills');
    await pass(me, 'cs-predict-output');
    await pass(me, 'cs-design-hostel-booking');

    const standing = (await learn(me).get('/standing')).body.data.standing;
    expect(standing).toMatchObject({
      isSimulated: true,
      canAdvance: true,
      level: { label: '100L' },
      nextLevel: { label: '200L' },
    });
    expect(standing.disclaimer).toMatch(/not UNILAG grades, credits/);

    const moved = await learn(me).post('/progression/advance');
    expect(moved.body.data.promotion).toMatchObject({ graduated: false, to: { level: 200 } });
    expect(moved.body.data.promotion.achievementsEarned.map((a) => a.key)).toContain('moving-up');
    expect((await StudentRecord.findOne({ player: me.player._id })).currentLevel).toBe(200);
    // double click can't skip a level
    expect((await learn(me).post('/progression/advance')).status).toBe(409);

    // a new level: fresh attempts, and level-targeted activities appear
    const list = (await learn(me).get('/activities')).body.data.activities;
    expect(list.find((a) => a.key === 'cs-predict-output').state).toMatchObject({
      attemptsUsed: 0,
      best: null,
    });
    expect(list.map((a) => a.key)).toContain('cs-security-scenario');
  });

  it('passing the final level graduates the player (game status only)', async () => {
    const me = await student({ onboarded: true, level: 400, entryLevel: 100 }); // CSC: 4 years
    await LearningProgress.create({
      player: me.player._id,
      university: (await University.findOne({ slug: 'unilag' }))._id,
      totalXp: 999,
      levels: [
        {
          level: 400,
          startedAt: new Date(),
          xp: 500,
          passed: ['a', 'b', 'c'],
          missions: ['departmental-week'],
          best: {},
        },
      ],
      missionsCompleted: [
        { key: 'fresher-first-week', level: 100, completedAt: new Date() },
        { key: 'departmental-week', level: 400, completedAt: new Date() },
      ],
    });
    const res = await learn(me).post('/progression/advance');
    expect(res.body.data.promotion).toMatchObject({ graduated: true, to: null });
    const record = await StudentRecord.findOne({ player: me.player._id });
    expect(record.status).toBe('graduated');
    expect(record.graduatedAt).toBeInstanceOf(Date);
    const student2 = await request(app).get('/api/v1/students/me').set(me.auth);
    expect(student2.body.data.student.progress.levels.every((l) => l.state === 'completed')).toBe(
      true,
    );
    expect((await learn(me).post('/progression/advance')).body.error.code).toBe(
      'ALREADY_GRADUATED',
    );
  });

  it('achievements list shows earned and locked ones', async () => {
    const me = await student();
    await pass(me, 'cs-predict-output');
    const list = (await learn(me).get('/achievements')).body.data.achievements;
    expect(list.find((a) => a.key === 'first-pass').earned).toBe(true);
    expect(list.find((a) => a.key === 'scholar-in-the-making').earned).toBe(false);
  });
});

describe('content stays data', () => {
  it('a new activity imported at runtime appears without any code change', async () => {
    const pack = {
      formatVersion: 1,
      university: 'unilag',
      activities: [
        {
          key: 'cs-new-runtime-activity',
          title: 'Brand new activity',
          discipline: 'Computing',
          engine: 'matching',
          targets: { programmes: ['CSC'] },
          content: {
            instructions: 'Match them.',
            pairs: [
              { id: 'a', left: 'HTML', right: 'Structure' },
              { id: 'b', left: 'CSS', right: 'Style' },
              { id: 'c', left: 'JavaScript', right: 'Behaviour' },
            ],
          },
        },
      ],
    };
    const res = await request(app)
      .post('/api/v1/admin/learning-packs/import')
      .set('X-Admin-Key', ADMIN_KEY)
      .send(pack);
    expect(res.status).toBe(201);
    const me = await student();
    expect((await learn(me).get('/activities')).body.data.activities.map((a) => a.key)).toContain(
      'cs-new-runtime-activity',
    );
    await LearningActivity.deleteOne({ key: 'cs-new-runtime-activity' });
  });
});
