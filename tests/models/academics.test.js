import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  University,
  Faculty,
  Department,
  Programme,
  AcademicSession,
} from '../../src/modules/models.js';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const config = {
  matricNumber: { template: '{yy}{seq:4}' },
  academicCalendar: { semesterNames: ['First', 'Second'] },
};

// two clearly fictional universities, to prove tenant isolation
let alpha;
let beta;
beforeEach(async () => {
  [alpha, beta] = await University.create([
    { name: 'Alpha Test University', shortName: 'ATU', slug: 'alpha-test', config },
    { name: 'Beta Test University', shortName: 'BTU', slug: 'beta-test', config },
  ]);
});

describe('Faculty', () => {
  it('uppercases codes and keeps them unique per university only', async () => {
    const eng = await Faculty.create({
      university: alpha._id,
      name: 'Faculty of Engineering',
      code: 'eng',
    });
    expect(eng.code).toBe('ENG');

    // same code in ANOTHER university is fine
    await expect(
      Faculty.create({ university: beta._id, name: 'Faculty of Engineering', code: 'ENG' }),
    ).resolves.toBeDefined();

    // same code in the SAME university is not
    const dup = await Faculty.create({ university: alpha._id, name: 'Other', code: 'ENG' }).catch(
      (e) => e,
    );
    expect(dup.code).toBe(11000);
  });

  it('validates the code format and required fields', async () => {
    const err = await Faculty.create({ code: 'a b' }).catch((e) => e);
    expect(Object.keys(err.errors)).toEqual(expect.arrayContaining(['university', 'name', 'code']));
  });

  it('cannot be moved to another university', async () => {
    const faculty = await Faculty.create({
      university: alpha._id,
      name: 'Faculty of Law',
      code: 'LAW',
    });
    faculty.university = beta._id;
    await faculty.save();
    expect(String((await Faculty.findById(faculty._id)).university)).toBe(String(alpha._id));
  });
});

describe('Department and Programme — same-university references', () => {
  it('links a department to a faculty of the same university', async () => {
    const faculty = await Faculty.create({
      university: alpha._id,
      name: 'Faculty of Science',
      code: 'SCI',
    });
    const dept = await Department.create({
      university: alpha._id,
      faculty: faculty._id,
      name: 'Department of Computer Sciences',
      code: 'CSC',
    });
    const programme = await Programme.create({
      university: alpha._id,
      department: dept._id,
      name: 'Computer Science',
      code: 'CSC',
      award: 'B.Sc.',
      durationYears: 4,
    });

    const populated = await Programme.findById(programme._id).populate({
      path: 'department',
      populate: { path: 'faculty' },
    });
    expect(populated.department.faculty.code).toBe('SCI');
  });

  it('rejects a department whose faculty belongs to another university', async () => {
    const betaFaculty = await Faculty.create({
      university: beta._id,
      name: 'Faculty of Arts',
      code: 'ART',
    });
    const err = await Department.create({
      university: alpha._id,
      faculty: betaFaculty._id,
      name: 'Department of English',
      code: 'ENG',
    }).catch((e) => e);

    expect(err.errors.faculty.message).toBe(
      'The faculty must exist and belong to the same university',
    );
  });

  it('rejects a programme whose department belongs to another university', async () => {
    const f = await Faculty.create({ university: beta._id, name: 'Faculty of Arts', code: 'ART' });
    const d = await Department.create({
      university: beta._id,
      faculty: f._id,
      name: 'Dept of English',
      code: 'ENG',
    });
    const err = await Programme.create({
      university: alpha._id,
      department: d._id,
      name: 'English',
      code: 'ENG',
      award: 'B.A.',
      durationYears: 4,
    }).catch((e) => e);

    expect(err.errors.department).toBeDefined();
  });

  it('validates programme duration', async () => {
    const err = await Programme.create({
      university: alpha._id,
      name: 'Bad',
      code: 'BAD',
      award: 'B.Sc.',
      durationYears: 4.5,
    }).catch((e) => e);
    expect(Object.keys(err.errors)).toEqual(
      expect.arrayContaining(['department', 'durationYears']),
    );
  });
});

describe('AcademicSession', () => {
  const session = (overrides = {}) => ({
    university: alpha._id,
    name: '2026/2027',
    startsOn: new Date('2026-10-05'),
    endsOn: new Date('2027-08-27'),
    ...overrides,
  });

  it('requires consecutive years and an end after the start', async () => {
    const err = await AcademicSession.create(
      session({ name: '2026/2028', endsOn: new Date('2026-01-01') }),
    ).catch((e) => e);
    expect(Object.keys(err.errors)).toEqual(expect.arrayContaining(['name', 'endsOn']));
  });

  it('allows only one current session per university', async () => {
    await AcademicSession.create(session({ isCurrent: true }));
    // another university can have its own current session
    await AcademicSession.create(session({ university: beta._id, isCurrent: true }));
    // past sessions are fine
    await AcademicSession.create(
      session({
        name: '2025/2026',
        startsOn: new Date('2025-10-06'),
        endsOn: new Date('2026-08-28'),
      }),
    );

    const dup = await AcademicSession.create(
      session({
        name: '2027/2028',
        startsOn: new Date('2027-10-04'),
        endsOn: new Date('2028-08-25'),
        isCurrent: true,
      }),
    ).catch((e) => e);
    expect(dup.code).toBe(11000);
  });
});
