import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds, SEED_BUNDLES } from '../seeds/seeder.js';
import { validateBundle } from '../src/modules/universities/bundle/validateBundle.js';
import { bus, EVENTS } from '../src/core/events.js';
import {
  ActivityLog,
  Discovery,
  Npc,
  Player,
  StudentRecord,
  University,
  User,
} from '../src/modules/models.js';

const { app, env } = buildTestApp();

beforeAll(async () => {
  await connectTestDb();
  await importSeeds();
});
afterAll(closeTestDb);
beforeEach(async () => {
  await Promise.all(
    [User, Player, StudentRecord, Discovery, ActivityLog].map((M) => M.deleteMany({})),
  );
});

const UNILAG = SEED_BUNDLES[0];
const clone = (val) => JSON.parse(JSON.stringify(val));

describe('UNILAG world data', () => {
  it('imports NPCs and world placements from the bundle', async () => {
    const uni = await University.findOne({ slug: 'unilag' });
    expect(uni.config.world.startZone).toBe('unilag-main-gate'); // new players start at the Main Gate;
    const npcs = await Npc.find({ university: uni._id });
    expect(npcs.length).toBe(UNILAG.npcs.length);
    npcs.forEach((npc) => {
      expect(npc.dialogue.start).toBeTruthy();
      expect(npc.verification.status).toBe('proposed'); // fictional characters
    });
  });

  it('rejects placements and NPCs in zones the university does not list', () => {
    const bundle = clone(UNILAG);
    bundle.locations.find((el) => el.world).world.zone = 'atlantis';
    bundle.npcs[0].zone = 'atlantis';
    const report = validateBundle(bundle);
    expect(report.valid).toBe(false);
    expect(
      report.errors.filter((el) => /atlantis/.test(el.message ?? JSON.stringify(el))).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('rejects dialogue that points at a missing node', () => {
    const bundle = clone(UNILAG);
    bundle.npcs[0].dialogue.start.options[0].next = 'nowhere';
    expect(validateBundle(bundle).valid).toBe(false);
  });
});

describe('GET /api/v1/campus/world', () => {
  it('needs sign-in', async () => {
    expect((await request(app).get('/api/v1/campus/world')).status).toBe(401);
  });

  it('is empty for a player who has not enrolled', async () => {
    const me = await makePlayer(env);
    const res = await request(app).get('/api/v1/campus/world').set(me.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.university).toBeNull();
  });

  it("returns the player's campus with placed locations, activities, NPCs and safe map links", async () => {
    const me = await makePlayer(env, { universitySlug: 'unilag' });
    const res = await request(app).get('/api/v1/campus/world').set(me.auth);
    expect(res.status).toBe(200);
    const { world, locations, npcs } = res.body.data;
    expect(world.zones).toContain('unilag-senate-lagoon');

    const cafeteria = locations.find((el) => el.slug === '2001-cafeteria');
    expect(cafeteria.world).toMatchObject({ zone: 'unilag-senate-lagoon' });
    expect(cafeteria.activities.map((el) => el.key)).toContain('buy-jollof');
    // plain Google Maps search links only — no API keys, no imagery
    expect(cafeteria.externalMapUrl).toMatch(
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/,
    );
    expect(cafeteria.externalMapUrl).not.toMatch(/key=/);
    expect(npcs.length).toBeGreaterThan(0);
    expect(locations.every((el) => el.discovered === false)).toBe(true);
  });
});

describe('discoveries and activities', () => {
  it('records a discovery once (201) then counts visits (200)', async () => {
    const me = await makePlayer(env, { universitySlug: 'unilag' });
    const first = await request(app)
      .post('/api/v1/campus/discoveries')
      .set(me.auth)
      .send({ locationSlug: 'senate-house' });
    expect(first.status).toBe(201);
    expect(first.body.data.isNew).toBe(true);

    const again = await request(app)
      .post('/api/v1/campus/discoveries')
      .set(me.auth)
      .send({ locationSlug: 'senate-house' });
    expect(again.status).toBe(200);
    expect(again.body.data.discovery.visits).toBe(2);

    const world = await request(app).get('/api/v1/campus/world').set(me.auth);
    expect(world.body.data.locations.find((el) => el.slug === 'senate-house').discovered).toBe(
      true,
    );
  });

  it('refuses places that are not in the game world, and unenrolled players', async () => {
    const me = await makePlayer(env, { universitySlug: 'unilag' });
    const res = await request(app)
      .post('/api/v1/campus/discoveries')
      .set(me.auth)
      .send({ locationSlug: 'no-such-place' });
    expect(res.status).toBe(404);

    const stranger = await makePlayer(env);
    const res2 = await request(app)
      .post('/api/v1/campus/discoveries')
      .set(stranger.auth)
      .send({ locationSlug: 'senate-house' });
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('NOT_ENROLLED');
  });

  it('does an activity, logs it and announces it on the bus', async () => {
    const me = await makePlayer(env, { universitySlug: 'unilag' });
    const seen = [];
    const listener = (e) => seen.push(e);
    bus.on(EVENTS.ACTIVITY_DONE, listener);
    const res = await request(app)
      .post('/api/v1/campus/activities')
      .set(me.auth)
      .send({ locationSlug: '2001-cafeteria', activityKey: 'buy-jollof' });
    bus.off(EVENTS.ACTIVITY_DONE, listener);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBeTruthy();
    expect(await ActivityLog.countDocuments({ player: me.player._id })).toBe(1);
    expect(seen[0]).toMatchObject({
      playerId: String(me.player._id),
      location: { slug: '2001-cafeteria' },
    });
  });

  it('rejects an activity the place does not offer', async () => {
    const me = await makePlayer(env, { universitySlug: 'unilag' });
    const res = await request(app)
      .post('/api/v1/campus/activities')
      .set(me.auth)
      .send({ locationSlug: 'senate-house', activityKey: 'buy-jollof' });
    expect(res.status).toBe(404);
  });
});
