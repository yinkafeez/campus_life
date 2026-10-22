import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makeTestBundle } from './helpers/bundles.js';
import { importSeeds } from '../seeds/seeder.js';
import { importBundle } from '../src/modules/universities/bundle/importBundle.js';
import {
  MatricSequence,
  Player,
  Session,
  StudentRecord,
  University,
  User,
} from '../src/modules/models.js';
import {
  allocateMatricNumber,
  maxSerial,
  renderMatricNumber,
} from '../src/modules/students/matric.service.js';

const { app } = buildTestApp({ AUTH_RATE_LIMIT_MAX: '1000' });

beforeAll(async () => {
  await connectTestDb();
  await importSeeds(); // UNILAG (template CL-{yy}{facultyCode:2}{departmentCode:2}{seq:3})
  // a fictional test university with instant review and a tiny serial range
  const bundle = makeTestBundle();
  bundle.university.config.matricNumber = {
    template: 'RTU-{yyyy}-{seq:1}',
    sequenceScope: 'university',
  };
  bundle.university.config.admission = { reviewSeconds: 0 };
  await importBundle(bundle);
});
afterAll(closeTestDb);

beforeEach(async () => {
  await Promise.all(
    [User, Player, Session, StudentRecord, MatricSequence].map((M) => M.deleteMany({})),
  );
});

let counter = 0;
async function signedInPlayer() {
  counter += 1;
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({
    email: `fresher${counter}@example.test`,
    username: `fresher_${counter}`,
    password: 'Jaja-hall-2026',
    displayName: `Fresher ${counter}`,
    confirmAge: true,
  });
  expect(res.status).toBe(201);
  return agent;
}

const UNILAG_CSC = {
  universitySlug: 'unilag',
  facultyCode: 'CIN',
  departmentCode: 'CSC',
  programmeCode: 'CSC',
  entryLevel: 100,
};

// skip the simulated review wait in tests
const finishReview = () =>
  StudentRecord.updateMany(
    { status: 'under_review' },
    { 'admission.reviewCompletesAt': new Date(Date.now() - 1000) },
  );

describe('admission options', () => {
  it('lists only enterable programmes with their allowed entry levels and the disclaimer', async () => {
    const res = await request(app).get('/api/v1/universities/unilag/admission-options');
    expect(res.status).toBe(200);
    expect(res.body.data.isSimulated).toBe(true);
    expect(res.body.data.disclaimer).toMatch(/not an offer of admission/i);

    const computing = res.body.data.faculties.find((el) => el.code === 'CIN');
    const csc = computing.departments.find((el) => el.code === 'CSC').programmes[0];
    expect(csc.entryLevels.map((el) => el.label)).toEqual(['100L', '200L']);
    // faculties without programmes are not offered
    expect(res.body.data.faculties.some((el) => el.code === 'ARC')).toBe(false);
  });
});

describe('ACCEPTANCE — register → simulated admission → matric number → onboarding → resume', () => {
  it('completes the whole journey and resumes the saved profile after signing in again', async () => {
    const agent = await signedInPlayer();

    // nothing yet
    expect((await agent.get('/api/v1/students/me')).body.error.code).toBe('NO_STUDENT_RECORD');

    // apply
    const applied = await agent.post('/api/v1/students/me/application').send(UNILAG_CSC);
    expect(applied.status).toBe(201);
    expect(applied.body.data.student).toMatchObject({
      status: 'under_review',
      isSimulated: true,
      university: { slug: 'unilag' },
      programme: { code: 'CSC' },
      entryLevel: { level: 100, label: '100L' },
    });
    expect(applied.body.data.student.admission.secondsUntilDecision).toBeGreaterThan(0);
    expect(applied.body.data.student.studentId).toMatch(/^stu_[0-9a-f-]{36}$/);

    // can't accept before the offer exists
    expect(
      (await agent.post('/api/v1/students/me/offer-response').send({ accept: true })).status,
    ).toBe(409);

    // review finishes → offer
    await finishReview();
    const offered = await agent.get('/api/v1/students/me');
    expect(offered.body.data.student.status).toBe('offered');

    // accept → matriculate
    expect(
      (await agent.post('/api/v1/students/me/offer-response').send({ accept: true })).body.data
        .student.status,
    ).toBe('accepted');
    const matric = await agent.post('/api/v1/students/me/matriculation');
    expect(matric.status).toBe(200);
    const { student } = matric.body.data;
    expect(student.status).toBe('matriculated');
    // fictional game format: CL- + YY + faculty(2) + department(2) + serial(3)
    expect(student.matric.number).toMatch(/^CL-26\d{2}\d{2}\d{3}$/);
    expect(student.matric.label).toBe('Fictional game matric number');
    expect(student.session.name).toBe('2026/2027');
    expect(student.progress.levels[0]).toMatchObject({ label: '100L', state: 'current' });
    expect(student.progress.yearsTotal).toBe(4);

    // matriculating twice changes nothing
    const again = await agent.post('/api/v1/students/me/matriculation');
    expect(again.status).toBe(409);

    // onboarding: every configured step (from the UNILAG bundle)
    const steps = student.onboarding.steps.map((el) => el.key);
    expect(steps).toContain('fresher-orientation');
    // a step at a campus place only completes after arriving there in the 3D world
    const first = student.onboarding.steps.find((el) => el.location);
    const early = await agent.post(`/api/v1/students/me/onboarding/${first.key}`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('VISIT_REQUIRED');

    let latest;
    /* eslint-disable no-await-in-loop -- steps are walked one after another */
    for (const { key, location } of student.onboarding.steps) {
      if (location) {
        expect(
          (await agent.post('/api/v1/campus/discoveries').send({ locationSlug: location })).status,
        ).toBeLessThan(300);
      }
      latest = await agent.post(`/api/v1/students/me/onboarding/${key}`);
      expect(latest.status).toBe(200);
    }
    /* eslint-enable no-await-in-loop */
    expect(latest.body.data.student.status).toBe('active');
    expect(latest.body.data.student.onboarding.completed).toBe(steps.length);

    // sign out, sign back in → same saved profile
    await agent.post('/api/v1/auth/logout');
    expect((await agent.get('/api/v1/students/me')).status).toBe(401);
    const username = (await User.findOne()).username;
    await agent
      .post('/api/v1/auth/login')
      .send({ identifier: username, password: 'Jaja-hall-2026' });
    const resumed = await agent.get('/api/v1/students/me');
    expect(resumed.body.data.student).toMatchObject({
      status: 'active',
      studentId: student.studentId,
      matric: { number: student.matric.number },
    });
  });
});

describe('admission rules', () => {
  it('only accepts configured choices and entry levels', async () => {
    const agent = await signedInPlayer();
    const wrongDept = await agent
      .post('/api/v1/students/me/application')
      .send({ ...UNILAG_CSC, departmentCode: 'CVE' });
    expect(wrongDept.status).toBe(400);
    expect(wrongDept.body.error.details[0].path).toBe('departmentCode');

    const badLevel = await agent
      .post('/api/v1/students/me/application')
      .send({ ...UNILAG_CSC, entryLevel: 300 });
    expect(badLevel.status).toBe(400);
    expect(badLevel.body.error.details[0].message).toMatch(/100L, 200L/);

    const draft = await agent
      .post('/api/v1/students/me/application')
      .send({ ...UNILAG_CSC, universitySlug: 'lagoon-crest' });
    expect(draft.status).toBe(404);
  });

  it('allows a new application after declining, but not two at once', async () => {
    const agent = await signedInPlayer();
    await agent.post('/api/v1/students/me/application').send(UNILAG_CSC);
    expect((await agent.post('/api/v1/students/me/application').send(UNILAG_CSC)).status).toBe(409);

    await finishReview();
    await agent.get('/api/v1/students/me');
    await agent.post('/api/v1/students/me/offer-response').send({ accept: false });

    const reapply = await agent.post('/api/v1/students/me/application').send({
      universitySlug: 'riverside-test',
      facultyCode: 'SCI',
      departmentCode: 'QA',
      programmeCode: 'QAS',
      entryLevel: 1,
    });
    expect(reapply.status).toBe(201);
    expect(reapply.body.data.student.university.slug).toBe('riverside-test');
    expect(await StudentRecord.countDocuments()).toBe(1);
  });
});

describe('matric allocation', () => {
  it('never issues the same number under concurrent matriculation', async () => {
    const agents = await Promise.all(Array.from({ length: 12 }, () => signedInPlayer()));
    await Promise.all(
      agents.map((a) => a.post('/api/v1/students/me/application').send(UNILAG_CSC)),
    );
    await finishReview();
    await Promise.all(agents.map((a) => a.get('/api/v1/students/me')));
    await Promise.all(
      agents.map((a) => a.post('/api/v1/students/me/offer-response').send({ accept: true })),
    );

    const results = await Promise.all(
      agents.map((a) => a.post('/api/v1/students/me/matriculation')),
    );
    const numbers = results.map((el) => el.body.data.student.matric.number);
    expect(new Set(numbers).size).toBe(12);
    // same department + year → serials 001..012
    expect(numbers.map((el) => el.slice(-3)).sort()).toEqual(
      Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(3, '0')),
    );
  }, 90_000); // many bcrypt sign-ups at once: slow when the whole suite runs in parallel

  it('rejects allocation cleanly when the serial range is exhausted', async () => {
    // RTU uses {seq:1}: serials 1..9 only
    const agents = await Promise.all(Array.from({ length: 10 }, () => signedInPlayer()));
    const rtu = {
      universitySlug: 'riverside-test',
      facultyCode: 'SCI',
      departmentCode: 'QA',
      programmeCode: 'QAS',
      entryLevel: 1,
    };
    for (const a of agents) {
      // eslint-disable-next-line no-await-in-loop
      await a.post('/api/v1/students/me/application').send(rtu);
      // eslint-disable-next-line no-await-in-loop
      await a.get('/api/v1/students/me');
      // eslint-disable-next-line no-await-in-loop
      await a.post('/api/v1/students/me/offer-response').send({ accept: true });
    }
    const results = [];
    for (const a of agents) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await a.post('/api/v1/students/me/matriculation'));
    }
    expect(results.slice(0, 9).every((el) => el.status === 200)).toBe(true);
    expect(results[9].status).toBe(409);
    expect(results[9].body.error.code).toBe('MATRIC_RANGE_EXHAUSTED');
    expect(results[0].body.data.student.matric.number).toBe('RTU-2026-1');
  }, 90_000); // many bcrypt sign-ups at once: slow when the whole suite runs in parallel

  it('renders templates and checks fixed-width codes', () => {
    expect(
      renderMatricNumber('CL-{yy}{facultyCode:2}{departmentCode:2}{seq:3}', {
        yy: '11',
        facultyCode: '08',
        departmentCode: '05',
        seq: 30,
      }),
    ).toBe('CL-110805030');
    expect(() =>
      renderMatricNumber('{facultyCode:2}{seq:3}', { facultyCode: 'CIN', seq: 1 }),
    ).toThrow(/2-character facultyCode/);
    expect(maxSerial('{yy}{seq:3}')).toBe(999);
  });

  it('restarts serials when the format version changes', async () => {
    const university = await University.findOne({ slug: 'riverside-test' });
    const units = {
      faculty: { _id: 'f', code: 'SCI' },
      department: { _id: 'd', code: 'QA' },
      programme: { _id: 'p', code: 'QAS' },
      entrySession: { name: '2026/2027' },
    };
    const v1 = await allocateMatricNumber({ university, ...units });
    university.config.matricNumber.formatVersion = 2;
    const v2 = await allocateMatricNumber({ university, ...units });
    expect([v1.formatVersion, v2.formatVersion]).toEqual([1, 2]);
    expect(v2.serial).toBe(1);
  });

  it('enforces uniqueness in MongoDB as well', async () => {
    const uni = await University.findOne({ slug: 'unilag' });
    const indexes = await StudentRecord.collection.indexes();
    const matricIndex = indexes.find((el) => el.key.matricNumber === 1);
    expect(matricIndex).toMatchObject({ unique: true, key: { university: 1, matricNumber: 1 } });
    expect(uni).toBeTruthy();
  });
});
