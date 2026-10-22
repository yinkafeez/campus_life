import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { importSeeds, resetSeeds } from '../seeds/seeder.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';

beforeAll(connectTestDb);
afterAll(closeTestDb);

const MODELS = [
  University,
  Faculty,
  Department,
  Programme,
  AcademicSession,
  CampusLocation,
  Hostel,
  LeadershipPosition,
];
const counts = async () =>
  Object.fromEntries(
    await Promise.all(MODELS.map(async (M) => [M.modelName, await M.countDocuments()])),
  );

// importing every seed pack is slow when the whole suite runs in parallel
describe('development seeds', { timeout: 120_000 }, () => {
  it('loads UNILAG and the fictional university through the bundle importer', async () => {
    const summary = await importSeeds();
    expect(summary.map((el) => el.slug)).toEqual([
      'unilag',
      'lagoon-crest',
      'wardrobe',
      'learning:unilag',
      'economy',
      'games:unilag',
    ]);

    const unilag = await University.findOne({ slug: 'unilag' });
    expect(unilag.status).toBe('active');
    expect(unilag.config.levels.values).toEqual([100, 200, 300, 400, 500, 600]);
    expect(unilag.dataNotes).toMatch(/UNVERIFIED/);

    // the fictional university proves different rules come from data alone
    const lcu = await University.findOne({ slug: 'lagoon-crest' });
    expect(lcu.status).toBe('draft');
    expect(lcu.config.matricNumber.sequenceScope).toBe('programme');
    expect(lcu.config.academicCalendar.semesterNames).toHaveLength(3);

    const csc = await Programme.findOne({ university: unilag._id, code: 'CSC' }).populate({
      path: 'department',
      populate: { path: 'faculty' },
    });
    expect(csc.department.faculty.name).toBe('Faculty of Computing and Informatics');

    // research honesty: real-world claims without confirmation stay marked
    const henryCarr = await Hostel.findOne({ university: unilag._id, slug: 'henry-carr-hall' });
    expect(henryCarr.verification.status).toBe('unverified');
    const library = await CampusLocation.findOne({
      university: unilag._id,
      slug: 'university-library',
    });
    expect(library.verification.status).toBe('verified');
    expect(library.verification.sources.length).toBeGreaterThan(0);
  });

  it('is idempotent', async () => {
    const before = await counts();
    await importSeeds();
    expect(await counts()).toEqual(before);
  });

  it('reset removes only the seeded universities and all their records', async () => {
    const other = await University.create({
      name: 'Untouched Test University',
      shortName: 'UTU',
      slug: 'untouched',
      config: {
        matricNumber: { template: '{seq:5}' },
        academicCalendar: { semesterNames: ['Only'] },
      },
    });

    await resetSeeds();

    const remaining = await University.find();
    expect(remaining.map((el) => el.slug)).toEqual(['untouched']);
    expect(String(remaining[0]._id)).toBe(String(other._id));
    const after = await counts();
    Object.entries(after)
      .filter(([model]) => model !== 'University')
      .forEach(([, n]) => expect(n).toBe(0));
  });
});
