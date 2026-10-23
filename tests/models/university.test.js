import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { University } from '../../src/modules/models.js';
import { matricTemplateProblems } from '../../src/modules/universities/university.config.js';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db.js';

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

// a clearly fictional university for tests
const validUniversity = (overrides = {}) => ({
  name: 'Testville University',
  shortName: 'tvu',
  slug: 'testville',
  config: {
    matricNumber: { template: '{yy}{facultyCode}{seq:4}' },
    academicCalendar: { semesterNames: ['First', 'Second'] },
  },
  ...overrides,
});

describe('University model', () => {
  it('creates a university with normalised fields and config defaults', async () => {
    const uni = await University.create(validUniversity());

    expect(uni.shortName).toBe('TVU');
    expect(uni.status).toBe('draft');
    expect(uni.timezone).toBe('Africa/Lagos');
    expect(uni.currency).toBe('NGN');
    expect(uni.location.country).toBe('NG');
    expect(uni.config.matricNumber.sequenceScope).toBe('department');
    expect(uni.configSchemaVersion).toBe(7);
    expect(uni.createdAt).toBeInstanceOf(Date);
    expect(uni.toJSON().__v).toBeUndefined();
  });

  it('fills v2 sections with defaults, so a v1-shaped config still works', async () => {
    const uni = await University.create(validUniversity());

    expect(uni.config.levels).toEqual({ values: [100, 200, 300, 400], labelFormat: '{level}L' });
    expect(uni.config.grading.cgpaScale).toBe(5);
    expect(uni.config.accommodation).toMatchObject({
      allocationStrategy: 'first-come',
      priorityGroups: [],
      applicationRequired: true,
      genderSeparated: true,
    });
    expect(uni.config.academicActivities.types).toEqual([]);
    expect(uni.config.elections).toMatchObject({
      votingMethod: 'first-past-the-post',
      campaignDays: 14,
      voterEligibility: {},
    });
  });

  it('rejects election rules that do not fit the university (levels, CGPA scale)', async () => {
    const err = await University.create(
      validUniversity({
        config: {
          ...validUniversity().config,
          levels: { values: [100, 200, 300] },
          grading: { cgpaScale: 4 },
          elections: { defaultCandidateEligibility: { minLevel: 250, minCgpa: 4.5 } },
        },
      }),
    ).catch((e) => e);

    expect(Object.keys(err.errors)).toEqual(
      expect.arrayContaining([
        'config.elections.defaultCandidateEligibility.minLevel',
        'config.elections.defaultCandidateEligibility.minCgpa',
      ]),
    );
  });

  it('rejects unordered levels and duplicate activity keys', async () => {
    const err = await University.create(
      validUniversity({
        config: {
          ...validUniversity().config,
          levels: { values: [200, 100] },
          academicActivities: {
            types: [
              { key: 'exam', name: 'Exam', kind: 'exam' },
              { key: 'exam', name: 'Exam again', kind: 'exam' },
            ],
          },
        },
      }),
    ).catch((e) => e);

    expect(Object.keys(err.errors)).toEqual(
      expect.arrayContaining(['config.levels.values', 'config.academicActivities.types']),
    );
  });

  it('requires name, shortName, slug and config', async () => {
    const err = await University.create({}).catch((e) => e);
    expect(Object.keys(err.errors)).toEqual(
      expect.arrayContaining(['name', 'shortName', 'slug', 'config']),
    );
  });

  it('rejects an invalid config with field-level messages', async () => {
    const err = await University.create(
      validUniversity({
        config: {
          matricNumber: { template: '{yy}{nonsense}', sequenceScope: 'galaxy' },
          academicCalendar: { semesterNames: [] },
          extraRule: true,
        },
      }),
    ).catch((e) => e);

    expect(err.name).toBe('ValidationError');
    const paths = Object.keys(err.errors);
    expect(paths).toEqual(
      expect.arrayContaining([
        'config.matricNumber.template',
        'config.matricNumber.sequenceScope',
        'config.academicCalendar.semesterNames',
      ]),
    );
  });

  it('enforces a unique, URL-safe, immutable slug', async () => {
    await University.create(validUniversity());
    const dup = await University.create(validUniversity({ name: 'Other' })).catch((e) => e);
    expect(dup.code).toBe(11000);

    const bad = await University.create(validUniversity({ slug: 'Bad Slug!' })).catch((e) => e);
    expect(bad.errors.slug).toBeDefined();

    const uni = await University.findOne({ slug: 'testville' });
    uni.slug = 'renamed';
    await uni.save();
    expect((await University.findById(uni._id)).slug).toBe('testville');
  });

  it('rejects an unknown time zone and bad currency', async () => {
    const err = await University.create(
      validUniversity({ timezone: 'Mars/Olympus', currency: 'naira' }),
    ).catch((e) => e);
    expect(Object.keys(err.errors)).toEqual(expect.arrayContaining(['timezone', 'currency']));
  });

  it('blocks operator injection in query filters (sanitizeFilter)', async () => {
    await University.create(validUniversity());
    await expect(University.findOne({ slug: { $ne: 'nobody' } })).rejects.toThrow();
  });
});

describe('matricTemplateProblems', () => {
  it('accepts valid templates from different universities', () => {
    expect(matricTemplateProblems('{yy}{facultyCode}{departmentCode}{seq:3}')).toEqual([]);
    expect(matricTemplateProblems('LCU/{yyyy}/{programmeCode}/{seq:4}')).toEqual([]);
  });

  it('explains what is wrong', () => {
    expect(matricTemplateProblems('{yy}')).toContain(
      'The template must contain exactly one {seq:N} token',
    );
    expect(matricTemplateProblems('{seq:3}{seq:2}')).toContain(
      'The template must contain exactly one {seq:N} token',
    );
    expect(matricTemplateProblems('{seq}')).toContain('{seq:N} needs a width N between 1 and 8');
    expect(matricTemplateProblems('{matric}{seq:3}')).toContain('Unknown token {matric}');
    expect(matricTemplateProblems('A B{seq:3}')).toContain(
      'Literal text may only contain letters, digits and / . _ -',
    );
  });
});
