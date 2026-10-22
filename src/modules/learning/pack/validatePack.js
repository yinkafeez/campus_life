import { getEngine } from '../engines/index.js';
import { packSchema } from './pack.schema.js';

/*
 * Validate a learning pack: structure, each activity's engine content, duplicates, and —
 * when a catalogue is given — that every code, level, location and reference exists.
 *
 * catalogue = { faculties:Set, departments:Set, programmes:Set, levels:number[],
 *               locations: Map<slug, { placed:boolean, activities:Set<key> }>,
 *               onboardingSteps:Set, existingActivityKeys:Set }
 */
const issue = (path, message) => ({ path, message });
const zodIssues = (error, prefix = '') =>
  error.issues.map((el) =>
    issue([prefix, ...el.path].filter((p) => p !== '').join('.'), el.message),
  );

function checkTargets(targets, path, catalogue, errors) {
  if (!catalogue) return;
  [
    ['faculties', catalogue.faculties, 'faculty'],
    ['departments', catalogue.departments, 'department'],
    ['programmes', catalogue.programmes, 'programme'],
  ].forEach(([field, known, label]) =>
    targets[field].forEach((value, i) => {
      if (!known.has(value))
        errors.push(issue(`${path}.targets.${field}.${i}`, `Unknown ${label} code "${value}"`));
    }),
  );
  targets.levels.forEach((level, i) => {
    if (!catalogue.levels.includes(level)) {
      errors.push(
        issue(
          `${path}.targets.levels.${i}`,
          `Level ${level} is not one of the university's levels`,
        ),
      );
    }
  });
}

export function validatePack(raw, { catalogue } = {}) {
  const parsed = packSchema.safeParse(raw);
  if (!parsed.success)
    return {
      valid: false,
      pack: null,
      errors: zodIssues(parsed.error),
      warnings: [],
      summary: null,
    };

  const pack = parsed.data;
  const errors = [];
  const warnings = [];

  const dupes = (list, label) => {
    const seen = new Set();
    list.forEach((el, i) => {
      if (seen.has(el.key))
        errors.push(issue(`${label}.${i}.key`, `Duplicate ${label} key "${el.key}"`));
      seen.add(el.key);
    });
  };
  dupes(pack.activities, 'activities');
  dupes(pack.missions, 'missions');
  dupes(pack.achievements, 'achievements');

  // engine content (normalised with the engine's defaults)
  pack.activities.forEach((activity, i) => {
    const engine = getEngine(activity.engine);
    const content = engine.contentSchema.safeParse(activity.content);
    if (!content.success) errors.push(...zodIssues(content.error, `activities.${i}.content`));
    else activity.content = content.data;
    checkTargets(activity.targets, `activities.${i}`, catalogue, errors);
    if (catalogue && activity.location && !catalogue.locations.has(activity.location)) {
      errors.push(issue(`activities.${i}.location`, `Unknown location "${activity.location}"`));
    }
    if (activity.engine === 'written' && content.success && content.data.criteria.length < 2) {
      warnings.push(
        issue(
          `activities.${i}.content.criteria`,
          'Written activities read better with 2+ rubric criteria',
        ),
      );
    }
  });

  const activityKeys = new Set([
    ...pack.activities.map((el) => el.key),
    ...(catalogue?.existingActivityKeys ?? []),
  ]);
  pack.missions.forEach((mission, i) => {
    checkTargets(mission.targets, `missions.${i}`, catalogue, errors);
    mission.steps.forEach((step, j) => {
      const path = `missions.${i}.steps.${j}.ref`;
      if (step.type === 'pass-activity' && !activityKeys.has(step.ref)) {
        errors.push(issue(path, `Unknown activity "${step.ref}"`));
      }
      if (!catalogue) return;
      if (step.type === 'discover-location') {
        const loc = catalogue.locations.get(step.ref);
        if (!loc) errors.push(issue(path, `Unknown location "${step.ref}"`));
        else if (!loc.placed)
          errors.push(issue(path, `Location "${step.ref}" is not placed in the game world`));
      }
      if (step.type === 'campus-activity') {
        const [slug, activityKey] = String(step.ref).split('/');
        if (!catalogue.locations.get(slug)?.activities.has(activityKey)) {
          errors.push(
            issue(
              path,
              `"${step.ref}" must be "<location>/<activity>" for a placed location's activity`,
            ),
          );
        }
      }
    });
  });

  const byDiscipline = {};
  pack.activities.forEach((a) => {
    byDiscipline[a.discipline ?? 'general'] = (byDiscipline[a.discipline ?? 'general'] ?? 0) + 1;
  });

  return {
    valid: errors.length === 0,
    pack,
    errors,
    warnings,
    summary: {
      university: pack.university,
      activities: pack.activities.length,
      missions: pack.missions.length,
      achievements: pack.achievements.length,
      byDiscipline,
    },
  };
}

/** A catalogue built from a university bundle file (offline validation). */
export function catalogueFromBundle(bundle) {
  const faculties = new Set();
  const departments = new Set();
  const programmes = new Set();
  (bundle.faculties ?? []).forEach((f) => {
    faculties.add(String(f.code).toUpperCase());
    (f.departments ?? []).forEach((d) => {
      departments.add(String(d.code).toUpperCase());
      (d.programmes ?? []).forEach((p) => programmes.add(String(p.code).toUpperCase()));
    });
  });
  const locations = new Map(
    (bundle.locations ?? []).map((l) => [
      l.slug,
      { placed: Boolean(l.world), activities: new Set((l.activities ?? []).map((a) => a.key)) },
    ]),
  );
  return {
    faculties,
    departments,
    programmes,
    levels: bundle.university?.config?.levels?.values ?? [],
    locations,
    existingActivityKeys: new Set(),
  };
}
