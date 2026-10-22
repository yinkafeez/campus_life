import University from '../../universities/university.model.js';
import Faculty from '../../academics/faculty.model.js';
import Department from '../../academics/department.model.js';
import Programme from '../../academics/programme.model.js';
import CampusLocation from '../../campus/campusLocation.model.js';
import { Achievement, LearningActivity, Mission } from '../learning.models.js';
import { validatePack } from './validatePack.js';

/*
 * Import (create / update) a university's learning pack — the one write path for the
 * CLI, the admin API and the seeds. Upserts by {university, key}; records not in the pack
 * are left alone (retire them with status "retired"). A dry run validates against the DB.
 */
const newStats = () => ({ created: 0, updated: 0, unchanged: 0 });

async function upsert(Model, filter, values, stats) {
  const doc = (await Model.findOne(filter)) ?? new Model(filter);
  doc.set(values);
  if (doc.isNew) stats.created += 1;
  else if (doc.isModified()) stats.updated += 1;
  else {
    stats.unchanged += 1;
    return;
  }
  await doc.save();
}

async function catalogueFor(university) {
  const [faculties, departments, programmes, locations, activityKeys] = await Promise.all([
    Faculty.distinct('code', { university: university._id }),
    Department.distinct('code', { university: university._id }),
    Programme.distinct('code', { university: university._id }),
    CampusLocation.find({ university: university._id }).select('slug world activities').lean(),
    LearningActivity.distinct('key', { university: university._id }),
  ]);
  return {
    faculties: new Set(faculties),
    departments: new Set(departments),
    programmes: new Set(programmes),
    levels: university.config.levels.values,
    locations: new Map(
      locations.map((l) => [
        l.slug,
        { placed: Boolean(l.world), activities: new Set((l.activities ?? []).map((a) => a.key)) },
      ]),
    ),
    existingActivityKeys: new Set(activityKeys),
  };
}

export async function importPack(raw, { dryRun = false } = {}) {
  const slug = typeof raw?.university === 'string' ? raw.university.trim().toLowerCase() : null;
  const university = slug ? await University.findOne({ slug }) : null;
  if (!university) {
    return {
      valid: false,
      errors: [
        {
          path: 'university',
          message: `Import the university "${slug ?? '?'}" before its learning pack`,
        },
      ],
      warnings: [],
      summary: null,
    };
  }

  const report = validatePack(raw, { catalogue: await catalogueFor(university) });
  if (!report.valid || dryRun) return { ...report, dryRun, pack: undefined };

  const results = { LearningActivity: newStats(), Mission: newStats(), Achievement: newStats() };
  const scope = { university: university._id };
  /* eslint-disable no-await-in-loop -- small lists, readable sequential upserts */
  for (const { key, opensAt, closesAt, ...fields } of report.pack.activities) {
    await upsert(
      LearningActivity,
      { ...scope, key },
      {
        ...fields,
        opensAt: opensAt ? new Date(opensAt) : undefined,
        closesAt: closesAt ? new Date(closesAt) : undefined,
      },
      results.LearningActivity,
    );
  }
  for (const { key, ...fields } of report.pack.missions) {
    await upsert(Mission, { ...scope, key }, fields, results.Mission);
  }
  for (const { key, ...fields } of report.pack.achievements) {
    await upsert(Achievement, { ...scope, key }, fields, results.Achievement);
  }
  /* eslint-enable no-await-in-loop */
  return { ...report, dryRun, pack: undefined, results };
}
