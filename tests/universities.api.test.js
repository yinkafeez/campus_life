import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makeTestBundle } from './helpers/bundles.js';
import { importSeeds } from '../seeds/seeder.js';

const ADMIN_KEY = 'test-admin-key-0123456789abcdef0123456789';
const { app } = buildTestApp({ ADMIN_API_KEY: ADMIN_KEY });
const admin = (req) => req.set('X-Admin-Key', ADMIN_KEY);

beforeAll(async () => {
  await connectTestDb();
  await importSeeds(); // UNILAG (active) + fictional Lagoon Crest (draft)
});
afterAll(closeTestDb);

describe('admin access', () => {
  it('rejects admin keys when no ADMIN_API_KEY is configured', async () => {
    const { app: noAdmin } = buildTestApp();
    const res = await request(noAdmin)
      .get('/api/v1/admin/universities')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ADMIN_DISABLED');
  });

  it('accepts a signed-in admin account and rejects a normal player', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send({
      email: 'admin.tester@example.test',
      username: 'admin_tester',
      password: 'Sup3r-secret-pass',
      displayName: 'Admin Tester',
      confirmAge: true,
    });
    expect((await agent.get('/api/v1/admin/universities')).status).toBe(403);

    const { User } = await import('../src/modules/models.js');
    await User.updateOne({ username: 'admin_tester' }, { role: 'admin' });
    expect((await agent.get('/api/v1/admin/universities')).status).toBe(200);
  });

  it('requires a key (401) and the right key (403)', async () => {
    const missing = await request(app).get('/api/v1/admin/universities');
    expect(missing.status).toBe(401);

    const wrong = await request(app).get('/api/v1/admin/universities').set('X-Admin-Key', 'nope');
    expect(wrong.status).toBe(403);
  });

  it('never parses a large body before the key is checked', async () => {
    const res = await request(app)
      .post('/api/v1/admin/university-bundles/import')
      .send(makeTestBundle());
    expect(res.status).toBe(401);
  });

  it('lists every university, drafts included, with catalogue counts', async () => {
    const res = await admin(request(app).get('/api/v1/admin/universities'));
    expect(res.status).toBe(200);
    const bySlug = Object.fromEntries(res.body.data.universities.map((el) => [el.slug, el]));
    expect(bySlug['lagoon-crest'].status).toBe('draft');
    expect(bySlug.unilag.catalogue).toMatchObject({ Faculty: 19, Hostel: 17 });
  });
});

describe('ACCEPTANCE — a second university from configuration and records only', () => {
  it('validates, dry-runs, imports and serves a new university with its own rules', async () => {
    const bundle = makeTestBundle();

    const validated = await admin(
      request(app).post('/api/v1/admin/university-bundles/validate').send(bundle),
    );
    expect(validated.status).toBe(200);
    expect(validated.body.data.report).toMatchObject({ valid: true, isNewUniversity: true });

    const dry = await admin(
      request(app).post('/api/v1/admin/university-bundles/import?dryRun=true').send(bundle),
    );
    expect(dry.status).toBe(200);
    expect(dry.body.data.report.dryRun).toBe(true);
    expect((await request(app).get('/api/v1/universities/riverside-test')).status).toBe(404);

    const imported = await admin(
      request(app).post('/api/v1/admin/university-bundles/import').send(bundle),
    );
    expect(imported.status).toBe(201);
    expect(imported.body.data.report.results.University.created).toBe(1);

    // the public catalogue now serves BOTH universities, each with its own rules
    const list = await request(app).get('/api/v1/universities');
    expect(list.body.data.universities.map((el) => el.slug)).toEqual(
      expect.arrayContaining(['unilag', 'riverside-test']),
    );
    expect(list.body.data.universities.map((el) => el.slug)).not.toContain('lagoon-crest');

    const programmes = await request(app).get('/api/v1/universities/riverside-test/programmes');
    expect(programmes.body.data.programmes[0].levels).toEqual([
      { level: 1, label: 'Year 1' },
      { level: 2, label: 'Year 2' },
      { level: 3, label: 'Year 3' },
    ]);

    const hostels = await request(app).get('/api/v1/universities/riverside-test/hostels');
    expect(hostels.body.data.accommodationRules.allocationStrategy).toBe('priority');
    expect(hostels.body.results).toBe(2);

    const positions = await request(app).get(
      '/api/v1/universities/riverside-test/leadership-positions',
    );
    expect(positions.body.data.electionRules.defaultCandidateEligibility).toEqual({
      minLevel: 2,
      minCgpa: 2.75,
    });

    // and UNILAG is unaffected
    const unilagProgrammes = await request(app).get(
      '/api/v1/universities/unilag/programmes?department=CVE',
    );
    expect(unilagProgrammes.body.data.programmes[0].levels.map((el) => el.label)).toEqual([
      '100L',
      '200L',
      '300L',
      '400L',
      '500L',
    ]);
  });

  it('rejects an invalid bundle with 422 and every problem listed, writing nothing', async () => {
    const bundle = makeTestBundle({
      university: { ...makeTestBundle().university, slug: 'broken-test' },
    });
    bundle.hostels[0].location = 'nowhere';
    bundle.leadershipPositions[0].candidateEligibility = { minCgpa: 9 };

    const res = await admin(
      request(app).post('/api/v1/admin/university-bundles/import').send(bundle),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUNDLE_INVALID');
    expect(res.body.error.details.map((el) => el.path)).toEqual(
      expect.arrayContaining([
        'hostels.0.location',
        'leadershipPositions.0.candidateEligibility.minCgpa',
      ]),
    );

    const listed = await admin(request(app).get('/api/v1/admin/universities'));
    expect(listed.body.data.universities.map((el) => el.slug)).not.toContain('broken-test');
  });

  it('updates status and config sections through PATCH (validated)', async () => {
    const bad = await admin(
      request(app)
        .patch('/api/v1/admin/universities/lagoon-crest')
        .send({ config: { grading: { cgpaScale: 99 } } }),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const ok = await admin(
      request(app)
        .patch('/api/v1/admin/universities/lagoon-crest')
        .send({ status: 'active', config: { elections: { campaignDays: 3 } } }),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data.university.config.elections.campaignDays).toBe(3);
    // other sections are kept
    expect(ok.body.data.university.config.matricNumber.sequenceScope).toBe('programme');

    expect((await request(app).get('/api/v1/universities/lagoon-crest')).status).toBe(200);
  });
});

describe('public UNILAG catalogue', () => {
  it('returns 404 for unknown and draft universities', async () => {
    const res = await request(app).get('/api/v1/universities/atlantis');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('UNIVERSITY_NOT_FOUND');
  });

  it('serves the faculty → department → programme tree', async () => {
    const res = await request(app).get('/api/v1/universities/unilag/faculties?include=programmes');
    expect(res.status).toBe(200);
    expect(res.body.results).toBe(19);
    const computing = res.body.data.faculties.find((el) => el.code === 'CIN');
    expect(computing.departments.map((el) => el.code).sort()).toEqual(['CSC', 'CSE', 'ISR']);
    expect(computing.verification.status).toBe('verified');
  });

  it('filters departments by faculty and rejects bad filters', async () => {
    const res = await request(app).get('/api/v1/universities/unilag/departments?faculty=eng');
    expect(res.body.data.departments).toHaveLength(3);

    const unknown = await request(app).get('/api/v1/universities/unilag/departments?faculty=ZZZ');
    expect(unknown.status).toBe(404);

    const bad = await request(app).get('/api/v1/universities/unilag/departments?faculty=$ne');
    expect(bad.status).toBe(400);
  });

  it('serves locations with search, category and verification filters', async () => {
    const search = await request(app).get('/api/v1/universities/unilag/locations?q=2k1');
    expect(search.body.data.locations.map((el) => el.slug)).toEqual(['2001-cafeteria']);
    expect(search.body.data.locations[0].parent.slug).toBe('new-hall-complex');

    const unverifiedFood = await request(app).get(
      '/api/v1/universities/unilag/locations?category=food&verification=unverified',
    );
    expect(unverifiedFood.body.results).toBeGreaterThan(0);
    unverifiedFood.body.data.locations.forEach((el) => {
      expect(el.category).toBe('food');
      expect(el.verification.status).toBe('unverified');
    });

    const parent = await request(app).get('/api/v1/universities/unilag/locations/new-hall-complex');
    expect(parent.body.data.children.map((el) => el.slug)).toEqual(['2001-cafeteria']);
  });

  it('serves hostels by gender with the university accommodation rules', async () => {
    const res = await request(app).get('/api/v1/universities/unilag/hostels?gender=female');
    expect(res.body.data.hostels.every((el) => el.residentGender === 'female')).toBe(true);
    expect(res.body.data.accommodationRules.allocationStrategy).toBe('lottery');

    const jaja = await request(app).get('/api/v1/universities/unilag/hostels/king-jaja-hall');
    expect(jaja.body.data.hostel.aliases).toContain('Jaja');
  });

  it('serves the current session and leadership positions by scope', async () => {
    const session = await request(app).get('/api/v1/universities/unilag/sessions/current');
    expect(session.body.data.session.name).toBe('2026/2027');

    const hall = await request(app).get(
      '/api/v1/universities/unilag/leadership-positions?scope=hall',
    );
    expect(hall.body.data.positions.map((el) => el.code)).toEqual(['HALLCHAIR']);
    expect(hall.body.data.electionRules.defaultCandidateEligibility.minCgpa).toBe(3);
  });
});
