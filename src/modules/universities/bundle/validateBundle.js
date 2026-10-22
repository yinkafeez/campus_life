import { bundleSchema } from './bundle.schema.js';
import { eligibilityRuleProblems } from '../../../shared/eligibility.js';
import { templateTokens } from '../university.config.js';

/*
 * Administrative validation for a university bundle — pure (no database).
 *
 *   validateBundle(raw, { config, knownLocationSlugs })
 *     config             — the university's config when the bundle doesn't carry one
 *                          (partial update of an existing university)
 *     knownLocationSlugs — locations that already exist in the database
 *
 * Returns { valid, bundle, errors: [{ path, message }], warnings: [...], summary }.
 * Every problem is reported at once, with a JSON path, so admins can fix a file in one go.
 */

const toPath = (parts) => parts.map(String).join('.');

// report each value that appears more than once in a list
function findDuplicates(items, keyOf, label, pathOf, errors) {
  const seen = new Map();
  items.forEach((item, index) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      errors.push({
        path: pathOf(index),
        message: `Duplicate ${label} "${key}" (first used at ${pathOf(seen.get(key))})`,
      });
    } else {
      seen.set(key, index);
    }
  });
}

function checkAcademicStructure(bundle, { levels, config }, errors) {
  const faculties = bundle.faculties ?? [];
  findDuplicates(
    faculties,
    (el) => el.code,
    'faculty code',
    (i) => `faculties.${i}.code`,
    errors,
  );
  findDuplicates(
    faculties,
    (el) => el.name,
    'faculty name',
    (i) => `faculties.${i}.name`,
    errors,
  );

  // department and programme codes are unique across the whole university
  const departments = faculties.flatMap((f, fi) =>
    f.departments.map((d, di) => ({ ...d, path: `faculties.${fi}.departments.${di}` })),
  );
  findDuplicates(
    departments,
    (el) => el.code,
    'department code',
    (i) => `${departments[i].path}.code`,
    errors,
  );

  const programmes = departments.flatMap((d) =>
    d.programmes.map((p, pi) => ({ ...p, path: `${d.path}.programmes.${pi}` })),
  );
  findDuplicates(
    programmes,
    (el) => el.code,
    'programme code',
    (i) => `${programmes[i].path}.code`,
    errors,
  );

  // a 5-year programme needs at least five levels
  if (levels.length) {
    programmes.forEach((p) => {
      if (p.durationYears > levels.length) {
        errors.push({
          path: `${p.path}.durationYears`,
          message: `A ${p.durationYears}-year programme needs ${p.durationYears} levels, but the university has ${levels.length}`,
        });
      }
    });
  }

  // matric codes must fit fixed-width template tokens, e.g. {facultyCode:2} → "08"
  const widths = Object.fromEntries(
    templateTokens(config?.matricNumber?.template ?? '')
      .filter((el) => el.width && el.name !== 'seq')
      .map((el) => [el.name, el.width]),
  );
  [
    ['facultyCode', faculties.map((el, i) => ({ ...el, path: `faculties.${i}` }))],
    ['departmentCode', departments],
    ['programmeCode', programmes],
  ].forEach(([token, units]) => {
    const width = widths[token];
    if (!width) return;
    units.forEach((unit) => {
      const value = unit.matricCode ?? unit.code;
      if (value.length !== width) {
        errors.push({
          path: `${unit.path}.matricCode`,
          message: `"${value}" must be exactly ${width} characters for {${token}:${width}} — set a matricCode`,
        });
      }
    });
  });

  return {
    faculties: faculties.length,
    departments: departments.length,
    programmes: programmes.length,
  };
}

function checkSessions(bundle, errors) {
  const sessions = bundle.sessions ?? [];
  findDuplicates(
    sessions,
    (el) => el.name,
    'session',
    (i) => `sessions.${i}.name`,
    errors,
  );

  sessions.forEach((s, i) => {
    const [first, second] = s.name.split('/').map(Number);
    if (second !== first + 1)
      errors.push({ path: `sessions.${i}.name`, message: 'A session spans two consecutive years' });
    if (!(s.endsOn > s.startsOn))
      errors.push({ path: `sessions.${i}.endsOn`, message: 'A session must end after it starts' });
  });

  if (sessions.filter((el) => el.isCurrent).length > 1) {
    errors.push({ path: 'sessions', message: 'Only one session can be the current session' });
  }
  return sessions.length;
}

function checkLocations(bundle, knownLocationSlugs, errors) {
  const locations = bundle.locations ?? [];
  findDuplicates(
    locations,
    (el) => el.slug,
    'location slug',
    (i) => `locations.${i}.slug`,
    errors,
  );

  const available = new Set([...knownLocationSlugs, ...locations.map((el) => el.slug)]);
  const parentOf = new Map(locations.map((el) => [el.slug, el.parent]));

  locations.forEach((loc, i) => {
    if (!loc.parent) return;
    if (loc.parent === loc.slug) {
      errors.push({
        path: `locations.${i}.parent`,
        message: 'A location cannot be its own parent',
      });
    } else if (!available.has(loc.parent)) {
      errors.push({
        path: `locations.${i}.parent`,
        message: `Unknown parent location "${loc.parent}"`,
      });
    } else {
      // walk up the chain inside the bundle to catch cycles (a → b → a)
      const visited = new Set([loc.slug]);
      let current = loc.parent;
      while (current && parentOf.has(current)) {
        if (visited.has(current)) {
          errors.push({
            path: `locations.${i}.parent`,
            message: `Parent chain loops back to "${current}"`,
          });
          break;
        }
        visited.add(current);
        current = parentOf.get(current);
      }
    }
  });
  return { count: locations.length, available };
}

function checkHostels(bundle, { levels, availableLocations, config }, errors, warnings) {
  const hostels = bundle.hostels ?? [];
  findDuplicates(
    hostels,
    (el) => el.slug,
    'hostel slug',
    (i) => `hostels.${i}.slug`,
    errors,
  );

  hostels.forEach((h, i) => {
    if (h.location && !availableLocations.has(h.location)) {
      errors.push({ path: `hostels.${i}.location`, message: `Unknown location "${h.location}"` });
    }
    h.allocation.eligibleLevels.forEach((level, li) => {
      if (levels.length && !levels.includes(level)) {
        errors.push({
          path: `hostels.${i}.allocation.eligibleLevels.${li}`,
          message: `Level ${level} is not one of the university's levels (${levels.join(', ')})`,
        });
      }
    });
    const configured = config?.accommodation?.priorityGroups ?? [];
    h.allocation.reservedFor.forEach((group, gi) => {
      if (!configured.includes(group)) {
        warnings.push({
          path: `hostels.${i}.allocation.reservedFor.${gi}`,
          message: `"${group}" is not in config.accommodation.priorityGroups, so it has no allocation priority`,
        });
      }
    });
  });
  return hostels.length;
}

function checkPositions(bundle, context, errors) {
  const positions = bundle.leadershipPositions ?? [];
  findDuplicates(
    positions,
    (el) => el.code,
    'position code',
    (i) => `leadershipPositions.${i}.code`,
    errors,
  );
  positions.forEach((p, i) => {
    eligibilityRuleProblems(p.candidateEligibility, context).forEach((problem) =>
      errors.push({
        path: toPath(['leadershipPositions', i, 'candidateEligibility', ...problem.path]),
        message: problem.message,
      }),
    );
  });
  return positions.length;
}

export function validateBundle(raw, { config: fallbackConfig, knownLocationSlugs = [] } = {}) {
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      bundle: null,
      errors: parsed.error.issues.map((issue) => ({
        path: toPath(issue.path) || '(root)',
        message: issue.message,
      })),
      warnings: [],
      summary: null,
    };
  }

  const bundle = parsed.data;
  const errors = [];
  const warnings = [];
  const config = bundle.university.config ?? fallbackConfig;
  const levels = config?.levels?.values ?? [];
  const context = { levels, cgpaScale: config?.grading?.cgpaScale };

  if (!config) {
    warnings.push({
      path: 'university.config',
      message: 'No configuration available — level and grading checks were skipped',
    });
  }

  const academic = checkAcademicStructure(bundle, { levels, config }, errors);
  const sessions = checkSessions(bundle, errors);
  const { count: locations, available } = checkLocations(bundle, knownLocationSlugs, errors);

  // onboarding steps that happen at a place must point at a real location
  if (bundle.university.config) {
    bundle.university.config.onboarding.steps.forEach((step, i) => {
      if (step.location && !available.has(step.location)) {
        errors.push({
          path: `university.config.onboarding.steps.${i}.location`,
          message: `Unknown location "${step.location}"`,
        });
      }
    });
  }

  const hostels = checkHostels(
    bundle,
    { levels, availableLocations: available, config },
    errors,
    warnings,
  );
  const leadershipPositions = checkPositions(bundle, context, errors);

  // NPCs: unique keys; NPCs and location placements must sit in a zone the university lists
  const npcs = bundle.npcs ?? [];
  findDuplicates(
    npcs,
    (el) => el.key,
    'NPC key',
    (i) => `npcs.${i}.key`,
    errors,
  );
  const zones = config?.world?.zones;
  if (zones?.length) {
    npcs.forEach((el, i) => {
      if (!zones.includes(el.zone)) {
        errors.push({
          path: `npcs.${i}.zone`,
          message: `Zone "${el.zone}" is not in config.world.zones`,
        });
      }
    });
    (bundle.locations ?? []).forEach((el, i) => {
      if (el.world && !zones.includes(el.world.zone)) {
        errors.push({
          path: `locations.${i}.world.zone`,
          message: `Zone "${el.world.zone}" is not in config.world.zones`,
        });
      }
    });
  }
  if (config?.world?.startZone && zones && !zones.includes(config.world.startZone)) {
    errors.push({
      path: 'university.config.world.startZone',
      message: 'startZone must be one of world.zones',
    });
  }

  // honesty check: how much of the catalogue is still unverified
  const verificationCounts = { verified: 0, unverified: 0, proposed: 0 };
  const allDepartments = (bundle.faculties ?? []).flatMap((el) => el.departments);
  [
    ...(bundle.faculties ?? []),
    ...allDepartments,
    ...allDepartments.flatMap((el) => el.programmes),
    ...(bundle.locations ?? []),
    ...(bundle.hostels ?? []),
    ...(bundle.leadershipPositions ?? []),
  ].forEach((el) => {
    verificationCounts[el.verification.status] += 1;
  });

  return {
    valid: errors.length === 0,
    bundle,
    errors,
    warnings,
    summary: {
      university: bundle.university.slug,
      ...academic,
      sessions,
      locations,
      hostels,
      leadershipPositions,
      npcs: npcs.length,
      verification: verificationCounts,
    },
  };
}
