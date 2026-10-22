import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import {
  CampaignItem,
  CampaignSupport,
  CampusEvent,
  Candidacy,
  Election,
  ElectionAudit,
  ElectionDispute,
  LeaderAction,
  LeadershipAssignment,
  LearningProgress,
  LedgerEntry,
  Player,
  StudentRecord,
  University,
  User,
  Vote,
  VoteReceipt,
  Wallet,
} from '../src/modules/models.js';

const ADMIN_KEY = 'test-only-admin-key-0123456789abcdef0123';
const { app, env } = buildTestApp({ ADMIN_API_KEY: ADMIN_KEY });
const sha256 = (v) => createHash('sha256').update(v).digest('hex');
const HOUR = 3_600_000;

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
      LearningProgress,
      Election,
      Candidacy,
      CampaignItem,
      CampaignSupport,
      VoteReceipt,
      Vote,
      ElectionDispute,
      LeadershipAssignment,
      LeaderAction,
      ElectionAudit,
      Wallet,
      LedgerEntry,
      CampusEvent,
    ].map((M) => M.collection.deleteMany({})),
  );
});

const el = (who) => ({
  get: (url) => request(app).get(`/api/v1/elections${url}`).set(who.auth),
  post: (url, body) => request(app).post(`/api/v1/elections${url}`).set(who.auth).send(body),
  del: (url) => request(app).delete(`/api/v1/elections${url}`).set(who.auth),
});
const admin = (method, url, body) =>
  request(app)[method](`/api/v1/admin${url}`).set('X-Admin-Key', ADMIN_KEY).send(body);

/** A 200L student (not a fresher, not final year) with a game standing from studies results. */
async function student({ programmeCode = 'CSC', level = 200, standingPercent = 80, ...rest } = {}) {
  const p = await makePlayer(env, {
    universitySlug: 'unilag',
    programmeCode,
    level,
    entryLevel: 100,
    ...rest,
  });
  if (standingPercent !== null) {
    await LearningProgress.create({
      player: p.player._id,
      university: unilag._id,
      levels: [
        {
          level,
          startedAt: new Date(),
          best: { a: { percent: standingPercent, xp: 10, passed: true } },
          passed: ['a'],
        },
      ],
    });
  }
  return p;
}

async function openCycle(codes = ['PRES', 'DEPTPRES', 'FACPRES']) {
  const res = await admin('post', '/universities/unilag/election-cycles', {
    positionCodes: codes,
    startsAt: new Date(Date.now() - 60_000).toISOString(),
  });
  expect(res.status).toBe(201);
  return res.body.data.cycle;
}
const findElection = (code, unitName) =>
  Election.findOne({ positionCode: code, ...(unitName && { 'scope.unitName': unitName }) });
/** Move an election's clock: 'campaign' | 'voting' | 'counting' | 'closed' (dispute window over). */
async function moveTo(election, stage) {
  const now = Date.now();
  const at = {
    campaign: [-3 * HOUR, -2 * HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR],
    voting: [-3 * HOUR, -2 * HOUR, -HOUR, 2 * HOUR, 3 * HOUR],
    counting: [-4 * HOUR, -3 * HOUR, -2 * HOUR, -HOUR, 2 * HOUR],
    closed: [-5 * HOUR, -4 * HOUR, -3 * HOUR, -2 * HOUR, -HOUR],
  }[stage].map((d) => new Date(now + d));
  await Election.updateOne(
    { _id: election._id },
    {
      $set: {
        schedule: {
          nominationsOpenAt: at[0],
          nominationsCloseAt: at[1],
          votingOpenAt: at[2],
          votingCloseAt: at[3],
          disputesCloseAt: at[4],
        },
      },
    },
  );
}
const nominate = (who, id, body = {}) =>
  el(who).post(`/${id}/candidacy`, {
    slogan: 'Students first',
    manifesto: { summary: 'Better hostels and clean water.', points: ['Water', 'Light'] },
    ...body,
  });

describe('election cycles and visibility', () => {
  it('opens one election per position and unit; students only see their own constituencies', async () => {
    await openCycle();
    expect(await Election.countDocuments({ positionCode: 'PRES' })).toBe(1);
    expect(await Election.countDocuments({ positionCode: 'DEPTPRES' })).toBeGreaterThan(5);
    const me = await student(); // Computer Science
    const list = (await el(me).get('/')).body.data.elections;
    const units = list.map((e) => `${e.positionCode}:${e.scope.unitName ?? ''}`);
    expect(units).toEqual(
      expect.arrayContaining([
        'PRES:UNILAG',
        'DEPTPRES:Department of Computer Science',
        'FACPRES:Faculty of Computing and Informatics',
      ]),
    );
    expect(units.some((u) => u.includes('Department of Mathematics'))).toBe(false);
    expect(list.every((e) => e.phase === 'nominations')).toBe(true);
    // opening the same cycle again creates nothing new
    const again = await admin('post', '/universities/unilag/election-cycles', {
      positionCodes: ['PRES'],
      cycle: list[0].cycle,
    });
    expect(again.body.data.cycle.created).toBe(0);
  });

  it('only admins open cycles', async () => {
    const me = await student();
    expect(
      (
        await request(app)
          .post('/api/v1/admin/universities/unilag/election-cycles')
          .set(me.auth)
          .send({})
      ).status,
    ).toBe(403);
  });
});

describe('standing for office', () => {
  it('enforces the configured candidate rules on the server', async () => {
    await openCycle(['PRES']);
    const pres = await findElection('PRES');
    const fresher = await student({ level: 100 });
    const weak = await student({ standingPercent: 40 }); // 2.0 / 5 < 3.0
    const finalYear = await student({ level: 400 });
    const good = await student();

    expect((await nominate(fresher, pres._id)).body.error.details).toContain(
      'Freshers (first-year students) cannot do this.',
    );
    expect((await nominate(weak, pres._id)).body.error.details).toContain(
      'Your game academic standing is below the required minimum.',
    );
    expect((await nominate(finalYear, pres._id)).body.error.code).toBe('NOT_ELIGIBLE');
    const ok = await nominate(good, pres._id);
    expect(ok.status).toBe(201);
    expect((await nominate(good, pres._id)).status).toBe(409);

    const view = (await el(fresher).get(`/${pres._id}`)).body.data;
    expect(view.me).toMatchObject({ canVote: true, canStand: false }); // freshers vote, they just can't stand
    expect(view.candidates[0]).toMatchObject({ slogan: 'Students first', status: 'nominated' });
  });

  it('one position per player per cycle; nominations close on schedule', async () => {
    await openCycle(['PRES', 'DEPTPRES']);
    const pres = await findElection('PRES');
    const dept = await findElection('DEPTPRES', 'Department of Computer Science');
    const me = await student();
    await nominate(me, pres._id);
    expect((await nominate(me, dept._id)).body.error.code).toBe('ALREADY_CONTESTING');
    await moveTo(dept, 'campaign');
    const other = await student();
    expect((await nominate(other, dept._id)).body.error.code).toBe('NOMINATIONS_CLOSED');
  });

  it('a student outside the constituency cannot see or stand in it', async () => {
    await openCycle(['DEPTPRES']);
    const dept = await findElection('DEPTPRES', 'Department of Computer Science');
    const mathsStudent = await student({ programmeCode: 'MTH' });
    expect((await el(mathsStudent).get(`/${dept._id}`)).status).toBe(404);
    expect((await nominate(mathsStudent, dept._id)).body.error.details).toContain(
      'You are not a member of this constituency.',
    );
  });
});

describe('campaigning', () => {
  it('posters, speeches and debate answers within limits; endorsements are buzz, not votes', async () => {
    await openCycle(['PRES']);
    const pres = await findElection('PRES');
    const ada = await student();
    const fan = await student();
    const cand = (await nominate(ada, pres._id)).body.data.candidacy;
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- posters are added one after another
      const posted = await el(ada).post(`/${pres._id}/campaign`, {
        kind: 'poster',
        title: `Poster ${i}`,
        body: 'Vote Ada!',
      });
      expect(posted.status).toBe(201);
    }
    expect(
      (await el(ada).post(`/${pres._id}/campaign`, { kind: 'poster', body: 'One more' })).body.error
        .code,
    ).toBe('CAMPAIGN_LIMIT');
    expect(
      (
        await el(ada).post(`/${pres._id}/campaign`, {
          kind: 'debate-answer',
          question: 0,
          body: 'Fix the water supply.',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await el(ada).post(`/${pres._id}/campaign`, {
          kind: 'debate-answer',
          question: 0,
          body: 'Again',
        })
      ).status,
    ).toBe(409);
    expect(
      (await el(fan).post(`/${pres._id}/campaign`, { kind: 'speech', body: 'Not a candidate' }))
        .status,
    ).toBe(403);

    expect(
      (await el(fan).post(`/${pres._id}/support`, { candidacyId: cand._id, kind: 'endorse' }))
        .status,
    ).toBe(204);
    expect(
      (await el(fan).post(`/${pres._id}/support`, { candidacyId: cand._id, kind: 'endorse' }))
        .status,
    ).toBe(409);
    expect(
      (await el(fan).post(`/${pres._id}/support`, { candidacyId: cand._id, kind: 'volunteer' }))
        .status,
    ).toBe(204);
    expect(
      (await el(ada).post(`/${pres._id}/support`, { candidacyId: cand._id, kind: 'endorse' }))
        .status,
    ).toBe(400);

    const view = (await el(fan).get(`/${pres._id}`)).body.data;
    expect(view.candidates[0].buzz).toEqual({ endorsements: 1, volunteers: 1, activities: 4 });
    expect(view.campaign).toHaveLength(4);
  });
});

describe('voting', () => {
  async function race() {
    await openCycle(['PRES']);
    const pres = await findElection('PRES');
    const a = await student();
    const b = await student();
    const ca = (await nominate(a, pres._id)).body.data.candidacy;
    const cb = (await nominate(b, pres._id)).body.data.candidacy;
    return { pres, a, b, ca, cb };
  }

  it('votes only while voting is open; once per voter, even with simultaneous requests', async () => {
    const { pres, ca } = await race();
    const voter = await student({ level: 100, standingPercent: null }); // freshers can vote
    expect(
      (await el(voter).post(`/${pres._id}/ballots`, { candidacyIds: [ca._id] })).body.error.code,
    ).toBe('VOTING_CLOSED');
    await moveTo(pres, 'voting');
    const tries = await Promise.all(
      Array.from({ length: 5 }, () =>
        el(voter).post(`/${pres._id}/ballots`, { candidacyIds: [ca._id] }),
      ),
    );
    expect(tries.filter((r) => r.status === 201)).toHaveLength(1);
    tries
      .filter((r) => r.status !== 201)
      .forEach((r) => expect(r.body.error.code).toBe('ALREADY_VOTED'));
    expect(await VoteReceipt.countDocuments({ election: pres._id })).toBe(1);
    expect(await Vote.countDocuments({ election: pres._id })).toBe(1);
  });

  it('rejects ballots with too many choices, duplicates, or someone who is not a candidate here', async () => {
    const { pres, ca, cb } = await race();
    await openCycle(['DEPTPRES']);
    const dept = await findElection('DEPTPRES', 'Department of Computer Science');
    const x = await student();
    const cx = (await nominate(x, dept._id)).body.data.candidacy;
    await moveTo(pres, 'voting');
    const voter = await student();
    expect(
      (await el(voter).post(`/${pres._id}/ballots`, { candidacyIds: [ca._id, cb._id] })).status,
    ).toBe(400); // 1 seat
    expect(
      (await el(voter).post(`/${pres._id}/ballots`, { candidacyIds: [ca._id, ca._id] })).status,
    ).toBe(400);
    expect((await el(voter).post(`/${pres._id}/ballots`, { candidacyIds: [cx._id] })).status).toBe(
      400,
    );
    expect(await VoteReceipt.countDocuments({})).toBe(0);
  });

  it('keeps ballots secret: votes carry no voter and no time; the voter can verify with a private code', async () => {
    const { pres, ca } = await race();
    await moveTo(pres, 'voting');
    const voter = await student();
    const res = await el(voter).post(`/${pres._id}/ballots`, { candidacyIds: [ca._id] });
    const vote = await Vote.findOne({ election: pres._id }).lean();
    expect(Object.keys(vote).sort()).toEqual(['_id', 'ballot', 'candidacy', 'election']);
    expect(typeof vote._id).toBe('string'); // not an ObjectId (no embedded timestamp)
    expect(JSON.stringify(vote)).not.toContain(String(voter.player._id));
    const check = await el(voter).post(`/${pres._id}/ballots/verify`, {
      code: res.body.data.ballotCode,
    });
    expect(check.body.data).toMatchObject({ counted: true, candidacies: [ca._id] });
    await expect(
      Vote.updateOne({ _id: vote._id }, { $set: { candidacy: ca._id } }),
    ).rejects.toThrow(/cannot be changed/);
  });

  it('a voter outside the constituency cannot vote', async () => {
    await openCycle(['DEPTPRES']);
    const dept = await findElection('DEPTPRES', 'Department of Computer Science');
    const c = await student();
    const cand = (await nominate(c, dept._id)).body.data.candidacy;
    await moveTo(dept, 'voting');
    const outsider = await student({ programmeCode: 'MTH' });
    const res = await el(outsider).post(`/${dept._id}/ballots`, { candidacyIds: [cand._id] });
    expect(res.status).toBe(403);
    expect(res.body.error.details).toContain('You are not a member of this constituency.');
  });
});

describe('results, disputes and certification', () => {
  async function election({ votesA = 0, votesB = 0, endorseB = 0 } = {}) {
    await openCycle(['PRES']);
    const pres = await findElection('PRES');
    const a = await student();
    const b = await student();
    const ca = (await nominate(a, pres._id)).body.data.candidacy;
    const cb = (await nominate(b, pres._id)).body.data.candidacy;
    for (let i = 0; i < endorseB; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const fan = await student();
      // eslint-disable-next-line no-await-in-loop
      await el(fan).post(`/${pres._id}/support`, { candidacyId: cb._id, kind: 'endorse' });
    }
    await moveTo(pres, 'voting');
    const voters = [];
    for (const [cand, n] of [
      [ca, votesA],
      [cb, votesB],
    ]) {
      for (let i = 0; i < n; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const v = await student();
        // eslint-disable-next-line no-await-in-loop
        await el(v).post(`/${pres._id}/ballots`, { candidacyIds: [cand._id] });
        voters.push(v);
      }
    }
    return { pres, a, b, ca, cb, voters };
  }

  it('popularity never replaces votes: the most-voted candidate wins, results are certified once and sealed', async () => {
    const { pres, a, ca, cb, voters } = await election({ votesA: 3, votesB: 1, endorseB: 4 });
    await moveTo(pres, 'counting');
    const provisional = (await el(a).get(`/${pres._id}`)).body.data;
    expect(provisional.election.phase).toBe('counting');
    expect(provisional.results).toMatchObject({ provisional: true, ballots: 4 });
    expect(provisional.candidates.find((c) => c.id === cb._id).buzz.endorsements).toBe(4);

    await moveTo(pres, 'closed');
    const final = (await el(voters[0]).get(`/${pres._id}`)).body.data;
    expect(final.election.phase).toBe('certified');
    expect(final.results).toMatchObject({ provisional: false, ballots: 4, winners: [ca._id] });
    expect(final.results.tallies.map((t) => t.votes)).toEqual([3, 1]);
    expect(final.results.hash).toMatch(/^[0-9a-f]{64}$/);

    const office = await LeadershipAssignment.findOne({ election: pres._id });
    expect(office).toMatchObject({ positionCode: 'PRES', status: 'active' });
    expect(String(office.player)).toBe(String(a.player._id));
    // nobody can rewrite certified results
    const res = await Election.updateOne(
      { _id: pres._id },
      { $set: { 'results.winners': [cb._id] } },
    );
    expect(res.modifiedCount).toBe(0);
    const doc = await Election.findById(pres._id);
    doc.results.winners = [cb._id];
    await expect(doc.save()).rejects.toThrow(/cannot be changed/);
    const audit = (await el(a).get(`/${pres._id}/audit`)).body.data.audit;
    expect(audit.map((e) => e.action)).toEqual(
      expect.arrayContaining(['created', 'nominated', 'certified']),
    );
    // players see roles, never admin account ids
    expect(JSON.stringify(audit)).not.toMatch(/user:|admin-key/);
    // a student of another university can't read it
    const outsider = await makePlayer(env, { universitySlug: 'lagoon-crest' });
    const peek = await request(app).get(`/api/v1/elections/${pres._id}/audit`).set(outsider.auth);
    expect(peek.status).toBe(404);
  });

  it('ties are broken by a drawing of lots that anyone can check against the committed seed', async () => {
    const { pres, a, ca, cb } = await election({ votesA: 1, votesB: 1 });
    await moveTo(pres, 'closed');
    const { results } = (await el(a).get(`/${pres._id}`)).body.data;
    expect(results.tieBreak).toMatchObject({ applied: true, method: 'drawing-of-lots' });
    const { seed } = results.tieBreak;
    const stored = await Election.findById(pres._id);
    expect(sha256(seed)).toBe(stored.lotSeedHash); // the seed was committed before voting
    const expected = [ca._id, cb._id].sort((x, y) =>
      sha256(`${seed}:${x}`).localeCompare(sha256(`${seed}:${y}`)),
    )[0];
    expect(results.winners).toEqual([expected]);
  });

  it('an open dispute blocks certification; an upheld dispute cancels the election', async () => {
    const { pres, a, voters } = await election({ votesA: 2 });
    await moveTo(pres, 'counting');
    const stranger = await student();
    expect(
      (await el(stranger).post(`/${pres._id}/disputes`, { reason: 'I did not vote' })).status,
    ).toBe(403);
    const filed = await el(voters[0]).post(`/${pres._id}/disputes`, {
      reason: 'Campaigning near the polls',
    });
    expect(filed.status).toBe(201);
    await moveTo(pres, 'closed');
    expect((await el(a).get(`/${pres._id}`)).body.data.election.phase).toBe('disputed');
    expect((await admin('post', `/elections/${pres._id}/certify`)).body.error.code).toBe(
      'DISPUTES_OPEN',
    );
    await admin('patch', `/election-disputes/${filed.body.data.dispute._id}`, {
      decision: 'upheld',
      note: 'Rules were broken',
    });
    const view = (await el(a).get(`/${pres._id}`)).body.data;
    expect(view.election.phase).toBe('cancelled');
    expect(view.election.cancellation.reason).toMatch(/Dispute upheld/);
    expect(await LeadershipAssignment.countDocuments({})).toBe(0);
  });

  it('a disqualified candidate cannot win and their votes are not counted', async () => {
    const { pres, a, ca, cb } = await election({ votesA: 3, votesB: 1 });
    await admin('post', `/elections/${pres._id}/candidates/${ca._id}/disqualify`, {
      reason: 'Vote buying',
    });
    await moveTo(pres, 'closed');
    const { results } = (await el(a).get(`/${pres._id}`)).body.data;
    expect(results.winners).toEqual([cb._id]);
    expect(results.tallies).toHaveLength(1);
  });

  it('an election with no votes is void (nobody is appointed)', async () => {
    const { pres, a } = await election();
    await moveTo(pres, 'closed');
    expect((await el(a).get(`/${pres._id}`)).body.data.election.phase).toBe('void');
  });
});

describe('leadership privileges', () => {
  async function leader(code, unitName, programmeCode = 'CSC') {
    await openCycle([code]);
    const e = await findElection(code, unitName);
    const who = await student({ programmeCode });
    const c = (await nominate(who, e._id)).body.data.candidacy;
    await moveTo(e, 'voting');
    const v = await student({ programmeCode });
    await el(v).post(`/${e._id}/ballots`, { candidacyIds: [c._id] });
    await moveTo(e, 'closed');
    await el(who).get(`/${e._id}`); // certifies
    const office = (await el(who).get('/offices/me')).body.data.offices[0];
    return { who, office };
  }

  it("department leaders announce to their department only, and can't give money", async () => {
    const { who, office } = await leader('DEPTPRES', 'Department of Computer Science');
    expect(office.privileges).toEqual(['announce', 'official-event']);
    const res = await el(who).post(`/offices/${office.id}/announcements`, {
      title: 'Class rep meeting',
      body: 'Friday 4pm at the library.',
    });
    expect(res.status).toBe(201);
    const classmate = await student();
    const outsider = await student({ programmeCode: 'MTH' });
    expect(
      (await el(classmate).get('/announcements')).body.data.announcements.map((a) => a.title),
    ).toContain('Class rep meeting');
    expect((await el(outsider).get('/announcements')).body.data.announcements).toHaveLength(0);
    const grant = await el(who).post(`/offices/${office.id}/welfare-grants`, {
      recipientId: String(classmate.player._id),
      amount: 10,
      reason: 'Help',
      requestKey: randomUUID(),
    });
    expect(grant.status).toBe(403);
  });

  it('faculty leaders give welfare grants inside their faculty, within budget and caps, never to themselves', async () => {
    const { who, office } = await leader('FACPRES', 'Faculty of Computing and Informatics');
    expect(office.welfare).toMatchObject({ budget: 300, left: 300 });
    const sameFaculty = await student({ programmeCode: 'ISR' }); // another CIN department
    const otherFaculty = await student({ programmeCode: 'MTH' });
    const grant = (to, amount) =>
      el(who).post(`/offices/${office.id}/welfare-grants`, {
        recipientId: String(to.player._id),
        amount,
        reason: 'Exam week support',
        requestKey: randomUUID(),
      });
    expect((await grant(who, 10)).status).toBe(403);
    expect((await grant(otherFaculty, 10)).body.error.message).toMatch(/your own constituency/);
    expect((await grant(sameFaculty, 40)).status).toBe(201);
    expect((await grant(sameFaculty, 20)).body.error.code).toBe('WELFARE_LIMIT'); // 50 per student per week
    expect((await Wallet.findOne({ player: sameFaculty.player._id })).balance).toBe(40);
    expect((await LedgerEntry.findOne({ player: sameFaculty.player._id })).kind).toBe('welfare');
    expect((await el(who).get('/offices/me')).body.data.offices[0].welfare.left).toBe(260);
  });

  it('official events are visible only inside the scope', async () => {
    const { who, office } = await leader('DEPTPRES', 'Department of Computer Science');
    const ev = await el(who).post(`/offices/${office.id}/events`, {
      title: 'Departmental week opening',
      locationSlug: 'jf-ade-ajayi-auditorium',
      startsAt: new Date(Date.now() + HOUR).toISOString(),
      endsAt: new Date(Date.now() + 3 * HOUR).toISOString(),
    });
    expect(ev.status).toBe(201);
    const classmate = await student();
    const outsider = await student({ programmeCode: 'MTH' });
    const events = async (p) =>
      (await request(app).get('/api/v1/community/events').set(p.auth)).body.data.events;
    const seen = await events(classmate);
    expect(seen[0]).toMatchObject({
      title: 'Departmental week opening',
      official: { positionCode: 'DEPTPRES' },
    });
    expect(await events(outsider)).toHaveLength(0);
    expect(
      (
        await request(app)
          .post(`/api/v1/community/events/${ev.body.data.event.id}/rsvp`)
          .set(outsider.auth)
      ).status,
    ).toBe(404);
  });

  it('removed leaders lose their privileges', async () => {
    const { who, office } = await leader('DEPTPRES', 'Department of Computer Science');
    await admin('post', `/leadership-offices/${office.id}/remove`, { reason: 'Misconduct' });
    expect(
      (
        await el(who).post(`/offices/${office.id}/announcements`, {
          title: 'Hi',
          body: 'Still here',
        })
      ).status,
    ).toBe(403);
  });
});
