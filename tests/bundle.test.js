import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { validateBundle } from '../src/modules/universities/bundle/validateBundle.js';
import { importBundle } from '../src/modules/universities/bundle/importBundle.js';
import {
  University,
  Faculty,
  Department,
  Programme,
  AcademicSession,
  CampusLocation,
  Hostel,
  LeadershipPosition,
} from '../src/modules/models.js';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db.js';
import { makeTestBundle } from './helpers/bundles.js';

const unilag = JSON.parse(
  readFileSync(new URL('../data/universities/unilag.json', import.meta.url), 'utf8'),
);

const pathsOf = (report) => report.errors.map((el) => el.path);

describe('validateBundle (offline)', () => {
  it('accepts the UNILAG catalogue and counts how much is verified', () => {
    const report = validateBundle(unilag);
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.summary).toMatchObject({ university: 'unilag', faculties: 19 });
    expect(report.summary.verification.unverified).toBeGreaterThan(0);
  });

  it('accepts the fictional test university', () => {
    expect(validateBundle(makeTestBundle()).valid).toBe(true);
  });

  it('reports structural problems with JSON paths', () => {
    const report = validateBundle({
      formatVersion: 1,
      university: { slug: 'Bad Slug' },
      hostels: [{ slug: 'x-hall', name: 'X Hall', residentGender: 'aliens' }],
      unexpected: true,
    });
    expect(report.valid).toBe(false);
    expect(pathsOf(report)).toEqual(
      expect.arrayContaining(['university.slug', 'hostels.0.residentGender', '(root)']),
    );
  });

  it('catches duplicates across the whole university', () => {
    const bundle = makeTestBundle();
    bundle.faculties.push({
      code: 'SCI',
      name: 'Faculty of Other Things',
      departments: [{ code: 'QA', name: 'Department of Quality Again', programmes: [] }],
    });
    bundle.locations.push({ slug: 'river-hall', name: 'Second River Hall', category: 'other' });

    expect(pathsOf(validateBundle(bundle))).toEqual(
      expect.arrayContaining([
        'faculties.1.code',
        'faculties.1.departments.0.code',
        'locations.2.slug',
      ]),
    );
  });

  it('checks references, cycles and rules against the university config', () => {
    const bundle = makeTestBundle();
    bundle.locations.push(
      { slug: 'loop-a', name: 'Loop A', category: 'other', parent: 'loop-b' },
      { slug: 'loop-b', name: 'Loop B', category: 'other', parent: 'loop-a' },
      { slug: 'orphan', name: 'Orphan', category: 'other', parent: 'nowhere' },
    );
    bundle.hostels[0].location = 'missing-place';
    bundle.hostels[0].allocation.eligibleLevels = [1, 7];
    bundle.faculties[0].departments[0].programmes[0].durationYears = 5; // only 3 levels
    bundle.leadershipPositions[1].candidateEligibility = { minLevel: 4, minCgpa: 4.5 };
    bundle.sessions.push({
      name: '2027/2029',
      startsOn: '2027-09-01',
      endsOn: '2027-01-01',
      isCurrent: true,
    });

    const report = validateBundle(bundle);
    expect(report.valid).toBe(false);
    expect(pathsOf(report)).toEqual(
      expect.arrayContaining([
        'locations.2.parent', // loop
        'locations.4.parent', // unknown parent
        'hostels.0.location',
        'hostels.0.allocation.eligibleLevels.1',
        'faculties.0.departments.0.programmes.0.durationYears',
        'leadershipPositions.1.candidateEligibility.minLevel',
        'leadershipPositions.1.candidateEligibility.minCgpa',
        'sessions.1.name',
        'sessions.1.endsOn',
        'sessions',
      ]),
    );
  });

  it('warns (not fails) when a hostel reserves beds for a group without priority', () => {
    const bundle = makeTestBundle();
    bundle.hostels[1].allocation = { reservedFor: ['freshers'] };
    const report = validateBundle(bundle);
    expect(report.valid).toBe(true);
    expect(report.warnings[0].path).toBe('hostels.1.allocation.reservedFor.0');
  });
});

describe('importBundle (database)', () => {
  beforeAll(connectTestDb);
  afterEach(clearTestDb);
  afterAll(closeTestDb);

  it('dry run validates against the database and writes nothing', async () => {
    const report = await importBundle(makeTestBundle(), { dryRun: true });
    expect(report).toMatchObject({ valid: true, dryRun: true, isNewUniversity: true });
    expect(report.results).toBeUndefined();
    expect(await University.countDocuments()).toBe(0);
  });

  it('creates a whole university — config, structure, places, hostels, positions — from data', async () => {
    const report = await importBundle(makeTestBundle());
    expect(report.valid).toBe(true);
    expect(report.results.University.created).toBe(1);

    const uni = await University.findOne({ slug: 'riverside-test' });
    expect(uni.config.levels.labelFormat).toBe('Year {level}');
    expect(uni.config.matricNumber.sequenceScope).toBe('university');

    const programme = await Programme.findOne({ university: uni._id, code: 'QAS' }).populate({
      path: 'department',
      populate: { path: 'faculty' },
    });
    expect(programme.department.faculty.code).toBe('SCI');

    const cafe = await CampusLocation.findOne({ university: uni._id, slug: 'river-cafe' }).populate(
      'parent',
    );
    expect(cafe.parent.slug).toBe('river-hall');

    const otter = await Hostel.findOne({ university: uni._id, slug: 'otter-house' }).populate(
      'location',
    );
    expect(otter.location.slug).toBe('river-hall');

    const head = await LeadershipPosition.findOne({ university: uni._id, code: 'HOUSEHEAD' });
    expect(head.candidateEligibility).toEqual({ minLevel: 3, requireScopeMembership: true });

    expect(await AcademicSession.countDocuments({ university: uni._id, isCurrent: true })).toBe(1);
  });

  it('is idempotent: importing again creates nothing new', async () => {
    await importBundle(makeTestBundle());
    const before = await Promise.all(
      [Faculty, Department, Programme, CampusLocation, Hostel, LeadershipPosition].map((M) =>
        M.countDocuments(),
      ),
    );

    const again = await importBundle(makeTestBundle());
    Object.values(again.results).forEach((el) => expect(el.created).toBe(0));

    const after = await Promise.all(
      [Faculty, Department, Programme, CampusLocation, Hostel, LeadershipPosition].map((M) =>
        M.countDocuments(),
      ),
    );
    expect(after).toEqual(before);
  });

  it('updates an existing university from a partial bundle (no config needed)', async () => {
    await importBundle(makeTestBundle());

    const report = await importBundle({
      formatVersion: 1,
      university: { slug: 'riverside-test' },
      // references a location that only exists in the database
      locations: [
        { slug: 'river-kiosk', name: 'River Kiosk', category: 'shop', parent: 'river-cafe' },
      ],
      hostels: [
        { slug: 'heron-house', name: 'Heron House', residentGender: 'male', capacity: 120 },
      ],
    });
    expect(report).toMatchObject({ valid: true, isNewUniversity: false });
    expect(report.results.Hostel.updated).toBe(1);

    const heron = await Hostel.findOne({ slug: 'heron-house' });
    expect(heron.capacity).toBe(120);
    const kiosk = await CampusLocation.findOne({ slug: 'river-kiosk' }).populate('parent');
    expect(kiosk.parent.slug).toBe('river-cafe');
    // records not in the partial bundle are untouched
    expect(await Faculty.countDocuments()).toBe(1);
  });

  it('uses the stored config to check a partial bundle', async () => {
    await importBundle(makeTestBundle());
    const report = await importBundle({
      formatVersion: 1,
      university: { slug: 'riverside-test' },
      hostels: [
        {
          slug: 'pike-house',
          name: 'Pike House',
          residentGender: 'male',
          allocation: { eligibleLevels: [400] },
        },
      ],
    });
    expect(report.valid).toBe(false);
    expect(pathsOf(report)).toEqual(['hostels.0.allocation.eligibleLevels.0']);
  });

  it('requires a new university to describe itself fully', async () => {
    const report = await importBundle({ formatVersion: 1, university: { slug: 'ghost-test' } });
    expect(report.valid).toBe(false);
    expect(pathsOf(report)).toEqual([
      'university.name',
      'university.shortName',
      'university.config',
    ]);
    expect(await University.countDocuments()).toBe(0);
  });

  it('moves the "current session" flag when a newer session becomes current', async () => {
    await importBundle(makeTestBundle());
    await importBundle({
      formatVersion: 1,
      university: { slug: 'riverside-test' },
      sessions: [
        { name: '2027/2028', startsOn: '2027-09-01', endsOn: '2028-06-30', isCurrent: true },
      ],
    });
    const current = await AcademicSession.find({ isCurrent: true });
    expect(current.map((el) => el.name)).toEqual(['2027/2028']);
  });
});
