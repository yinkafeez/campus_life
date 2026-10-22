import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import {
  AccommodationAssignment,
  Hostel,
  Player,
  StudentRecord,
  University,
  User,
} from '../src/modules/models.js';

const ADMIN_KEY = 'test-only-admin-key-0123456789abcdef0123';
const { app, env } = buildTestApp({ ADMIN_API_KEY: ADMIN_KEY });

let unilag;
beforeAll(async () => {
  await connectTestDb();
  await importSeeds();
  unilag = await University.findOne({ slug: 'unilag' });
});
afterAll(closeTestDb);
beforeEach(async () => {
  await Promise.all(
    [User, Player, StudentRecord, AccommodationAssignment].map((M) => M.deleteMany({})),
  );
});

const acc = (who) => ({
  get: (url) => request(app).get(`/api/v1/accommodation${url}`).set(who.auth),
  post: (url, body) => request(app).post(`/api/v1/accommodation${url}`).set(who.auth).send(body),
  del: (url) => request(app).delete(`/api/v1/accommodation${url}`).set(who.auth),
});
const student = (opts) => makePlayer(env, { universitySlug: 'unilag', ...opts });
const setRoomPlan = (slug, roomPlan) =>
  Hostel.updateOne({ university: unilag._id, slug }, { $set: { roomPlan } });

describe('eligibility', () => {
  it('lists hostels with eligibility reasons from each hall record', async () => {
    const fresher = await student({ gender: 'female', level: 100 });
    const res = await acc(fresher).get('/hostels');
    expect(res.status).toBe(200);
    const bySlug = Object.fromEntries(res.body.data.hostels.map((el) => [el.slug, el]));
    expect(bySlug['ulws-hostel'].eligible).toBe(true); // female, direct, any level
    expect(bySlug['king-jaja-hall'].problems).toContain('This is a male hall.');
    expect(bySlug['queen-moremi-hall'].problems.join(' ')).toMatch(/200, 300, 400, 500 level/);
    expect(bySlug['henry-carr-hall'].problems).toContain('This hall is not open to players yet.');
    expect(res.body.data.rules.allocationStrategy).toBeTruthy();
  });

  it('refuses players who are not matriculated, have no gender set, or are not enrolled', async () => {
    const applicant = await student({ gender: 'male', status: 'offered' });
    expect(
      (await acc(applicant).post('/me', { hostelSlug: 'el-kanemi-hall' })).body.error.code,
    ).toBe('NOT_ELIGIBLE');
    const noGender = await student({});
    const res = await acc(noGender).post('/me', { hostelSlug: 'el-kanemi-hall' });
    expect(res.body.error.details).toContain('Set your character gender in your profile first.');
    const outsider = await makePlayer(env, { gender: 'male' });
    expect(
      (await acc(outsider).post('/me', { hostelSlug: 'el-kanemi-hall' })).body.error.code,
    ).toBe('NOT_ENROLLED');
  });
});

describe('direct halls', () => {
  it('books a bed, shows roommates, refuses a second bed, and vacates', async () => {
    await setRoomPlan('el-kanemi-hall', { rooms: 2, bedsPerRoom: 2 });
    const tunde = await student({ gender: 'male' });
    const musa = await student({ gender: 'male' });

    const booked = await acc(tunde).post('/me', { hostelSlug: 'el-kanemi-hall' });
    expect(booked.status).toBe(201);
    expect(booked.body.data.assignment).toMatchObject({
      status: 'active',
      room: 1,
      isSimulated: true,
    });
    expect((await acc(musa).post('/me', { hostelSlug: 'el-kanemi-hall' })).status).toBe(201);

    const mine = await acc(tunde).get('/me');
    expect(mine.body.data.roommates.map((el) => el.username)).toEqual([musa.username]);

    expect(
      (await acc(tunde).post('/me', { hostelSlug: 'femi-gbajabiamila-hall' })).body.error.code,
    ).toBe('ALREADY_HOUSED');
    expect((await acc(tunde).del('/me')).status).toBe(204);
    expect((await acc(tunde).get('/me')).body.data.assignment).toBeNull();
    expect((await acc(tunde).post('/me', { hostelSlug: 'femi-gbajabiamila-hall' })).status).toBe(
      201,
    );
  });

  it('never puts two players in one bed, even when many book at once, and stops at capacity', async () => {
    await setRoomPlan('el-kanemi-hall', { rooms: 2, bedsPerRoom: 2 }); // 4 beds
    const players = await Promise.all(Array.from({ length: 7 }, () => student({ gender: 'male' })));
    const results = await Promise.all(
      players.map((p) => acc(p).post('/me', { hostelSlug: 'el-kanemi-hall' })),
    );
    const statuses = results.map((el) => el.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(4);
    results
      .filter((el) => el.status !== 201)
      .forEach((el) => expect(el.body.error.code).toBe('HOSTEL_FULL'));

    const beds = await AccommodationAssignment.find({ status: 'active' }).select('room bed');
    expect(new Set(beds.map((el) => `${el.room}:${el.bed}`)).size).toBe(4);
  });
});

describe('ballot halls', () => {
  it('apply (202) → the admin draw allocates up to capacity → the rest are unsuccessful', async () => {
    await setRoomPlan('king-jaja-hall', { rooms: 1, bedsPerRoom: 2 });
    const applicants = await Promise.all(
      Array.from({ length: 3 }, () => student({ gender: 'male', level: 200 })),
    );
    for (const p of applicants) {
      // eslint-disable-next-line no-await-in-loop -- apply in order
      const res = await acc(p).post('/me', { hostelSlug: 'king-jaja-hall' });
      expect(res.status).toBe(202);
      expect(res.body.data.assignment.status).toBe('applied');
    }

    const draw = await request(app)
      .post('/api/v1/admin/universities/unilag/hostels/king-jaja-hall/ballot')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(draw.status).toBe(200);
    expect(draw.body.data.result).toMatchObject({ applicants: 3, allocated: 2, unsuccessful: 1 });

    const states = await Promise.all(
      applicants.map(async (p) => (await acc(p).get('/me')).body.data.assignment.status),
    );
    expect([...states].sort()).toEqual(['active', 'active', 'unsuccessful']);

    // an unsuccessful applicant may apply somewhere else
    const loser = applicants[states.indexOf('unsuccessful')];
    expect((await acc(loser).post('/me', { hostelSlug: 'el-kanemi-hall' })).status).toBe(201);
  });

  it('the draw needs an admin', async () => {
    const someone = await student({ gender: 'male' });
    const res = await request(app)
      .post('/api/v1/admin/universities/unilag/hostels/king-jaja-hall/ballot')
      .set(someone.auth);
    expect(res.status).toBe(403);
  });
});
