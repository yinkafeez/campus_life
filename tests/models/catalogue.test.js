import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  University,
  Faculty,
  CampusLocation,
  Hostel,
  LeadershipPosition,
} from '../../src/modules/models.js';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const config = {
  matricNumber: { template: '{yy}{seq:4}' },
  academicCalendar: { semesterNames: ['First', 'Second'] },
};

let alpha;
let beta;
beforeEach(async () => {
  [alpha, beta] = await University.create([
    { name: 'Alpha Test University', shortName: 'ATU', slug: 'alpha-test', config },
    { name: 'Beta Test University', shortName: 'BTU', slug: 'beta-test', config },
  ]);
});

describe('verification block', () => {
  it('defaults to unverified', async () => {
    const faculty = await Faculty.create({
      university: alpha._id,
      name: 'Faculty of Law',
      code: 'LAW',
    });
    expect(faculty.verification.status).toBe('unverified');
    expect(faculty.verification.sources).toEqual([]);
  });

  it('requires a source for verified records and valid URLs', async () => {
    const noSource = await Faculty.create({
      university: alpha._id,
      name: 'Faculty of Arts',
      code: 'ART',
      verification: { status: 'verified' },
    }).catch((e) => e);
    expect(noSource.errors['verification.status'].message).toBe(
      'A verified record must cite at least one source',
    );

    const badUrl = await Faculty.create({
      university: alpha._id,
      name: 'Faculty of Arts',
      code: 'ART',
      verification: { status: 'verified', sources: [{ title: 'Somewhere', url: 'ftp://x' }] },
    }).catch((e) => e);
    expect(badUrl.errors['verification.sources.0.url']).toBeDefined();
  });
});

describe('CampusLocation', () => {
  it('nests a location inside a parent of the same university', async () => {
    const sub = await CampusLocation.create({
      university: alpha._id,
      slug: 'union-building',
      name: 'Union Building',
      category: 'administrative',
    });
    const cafe = await CampusLocation.create({
      university: alpha._id,
      slug: 'union-cafe',
      name: 'Union Cafe',
      category: 'food',
      parent: sub._id,
    });
    expect(String(cafe.parent)).toBe(String(sub._id));
  });

  it('rejects a parent from another university, itself as parent, and unknown categories', async () => {
    const betaPlace = await CampusLocation.create({
      university: beta._id,
      slug: 'beta-gate',
      name: 'Beta Gate',
      category: 'gate',
    });
    const crossTenant = await CampusLocation.create({
      university: alpha._id,
      slug: 'alpha-kiosk',
      name: 'Alpha Kiosk',
      category: 'spaceport',
      parent: betaPlace._id,
    }).catch((e) => e);
    expect(Object.keys(crossTenant.errors)).toEqual(expect.arrayContaining(['parent', 'category']));

    const loop = await CampusLocation.create({
      university: alpha._id,
      slug: 'loop',
      name: 'Loop',
      category: 'other',
    });
    loop.parent = loop._id;
    const err = await loop.save().catch((e) => e);
    expect(err.errors.parent.message).toBe('A location cannot be its own parent');
  });

  it('keeps slugs unique per university only', async () => {
    const values = { slug: 'main-gate', name: 'Main Gate', category: 'gate' };
    await CampusLocation.create({ university: alpha._id, ...values });
    await CampusLocation.create({ university: beta._id, ...values });
    const dup = await CampusLocation.create({ university: alpha._id, ...values }).catch((e) => e);
    expect(dup.code).toBe(11000);
  });
});

describe('Hostel', () => {
  it('validates who it houses and links to a same-university location', async () => {
    const betaPlace = await CampusLocation.create({
      university: beta._id,
      slug: 'beta-yard',
      name: 'Beta Yard',
      category: 'hostel',
    });
    const err = await Hostel.create({
      university: alpha._id,
      slug: 'jupiter-hall',
      name: 'Jupiter Hall',
      residentGender: 'everyone',
      location: betaPlace._id,
      allocation: { reservedFor: ['vips'] },
    }).catch((e) => e);
    expect(Object.keys(err.errors)).toEqual(
      expect.arrayContaining(['residentGender', 'location', 'allocation.reservedFor.0']),
    );

    const ok = await Hostel.create({
      university: alpha._id,
      slug: 'jupiter-hall',
      name: 'Jupiter Hall',
      residentGender: 'female',
    });
    expect(ok.residentType).toBe('undergraduate');
    expect(ok.allocation.eligibleLevels).toEqual([]);
  });
});

describe('LeadershipPosition', () => {
  it('stores normalised candidate rules', async () => {
    const position = await LeadershipPosition.create({
      university: alpha._id,
      code: 'pres',
      title: 'President',
      scope: 'university',
      candidateEligibility: { minCgpa: 3, excludeFreshers: true },
    });
    expect(position.code).toBe('PRES');
    expect(position.seats).toBe(1);
    expect(position.candidateEligibility).toEqual({ minCgpa: 3, excludeFreshers: true });
  });

  it('rejects malformed rules and unknown scopes', async () => {
    const err = await LeadershipPosition.create({
      university: alpha._id,
      code: 'CHAIR',
      title: 'Chair',
      scope: 'planet',
      candidateEligibility: { minLevel: 'high', bribeAmount: 1000 },
    }).catch((e) => e);
    expect(Object.keys(err.errors)).toEqual(
      expect.arrayContaining(['scope', 'candidateEligibility.minLevel', 'candidateEligibility']),
    );
  });
});
