import mongoose from '../../../core/db/mongoose.js';
import {
  University,
  Faculty,
  Department,
  Programme,
  AcademicSession,
  CampusLocation,
  Hostel,
  LeadershipPosition,
  Npc,
} from '../../models.js';
import { validateBundle } from './validateBundle.js';

/*
 * Import (create or update) a university from a bundle — the ONE write path used by the
 * admin API, the CLI and the development seeds.
 *
 *  1) preflight: validate the bundle against what already exists in the database
 *  2) dry run: stop and return the report (nothing written)
 *  3) write in dependency order; every record goes through doc.set() + save(), so all
 *     schema validators and hooks run. Re-importing the same bundle is safe (idempotent).
 *
 * Records not mentioned in a bundle are left alone (bundles add/update, never delete).
 * Writes are not wrapped in a transaction (the local dev database is standalone); the
 * preflight catches problems before anything is written, and a re-run completes a
 * partially applied import.
 */

const newStats = () => ({ created: 0, updated: 0, unchanged: 0 });

// find by natural key → set → save only when something changed
async function upsert(Model, filter, values, stats) {
  const doc = (await Model.findOne(filter)) ?? new Model(filter);
  doc.set(values);

  if (doc.isNew) stats.created += 1;
  else if (doc.isModified()) stats.updated += 1;
  else {
    stats.unchanged += 1;
    return doc;
  }
  await doc.save();
  return doc;
}

/** Preflight only: validate against the database without writing. */
export async function preflightBundle(raw) {
  const slug =
    typeof raw?.university?.slug === 'string' ? raw.university.slug.trim().toLowerCase() : null;
  const existing = slug ? await University.findOne({ slug }) : null;

  const knownLocationSlugs = existing
    ? await CampusLocation.distinct('slug', { university: existing._id })
    : [];

  const report = validateBundle(raw, { config: existing?.config, knownLocationSlugs });
  report.isNewUniversity = !existing;

  // a brand-new university must describe itself fully
  if (report.bundle && !existing) {
    ['name', 'shortName', 'config'].forEach((field) => {
      if (report.bundle.university[field] == null) {
        report.errors.push({
          path: `university.${field}`,
          message: `A new university needs a ${field}`,
        });
      }
    });
    report.valid = report.errors.length === 0;
  }

  return { report, existing };
}

/* eslint-disable no-await-in-loop -- parents must exist before their children */

async function importAcademics(bundle, university, stats) {
  for (const { departments, ...facultyFields } of bundle.faculties ?? []) {
    const faculty = await upsert(
      Faculty,
      { university: university._id, code: facultyFields.code },
      facultyFields,
      stats.Faculty,
    );

    for (const { programmes, ...departmentFields } of departments) {
      const department = await upsert(
        Department,
        { university: university._id, code: departmentFields.code },
        { ...departmentFields, faculty: faculty._id },
        stats.Department,
      );

      for (const programmeFields of programmes) {
        await upsert(
          Programme,
          { university: university._id, code: programmeFields.code },
          { ...programmeFields, department: department._id },
          stats.Programme,
        );
      }
    }
  }
}

async function importSessions(bundle, university, stats) {
  const sessions = bundle.sessions ?? [];
  const current = sessions.find((el) => el.isCurrent);

  // clear the old "current" flag first so the one-current-session index never trips
  if (current) {
    await AcademicSession.updateMany(
      {
        university: university._id,
        isCurrent: true,
        name: mongoose.trusted({ $ne: current.name }),
      },
      { isCurrent: false },
    );
  }
  for (const { name, ...fields } of sessions) {
    await upsert(
      AcademicSession,
      { university: university._id, name },
      fields,
      stats.AcademicSession,
    );
  }
}

async function importLocations(bundle, university, stats) {
  const locations = bundle.locations ?? [];
  const idBySlug = new Map();

  // pass 1: the locations themselves; pass 2: parent links (parents may come later in the file)
  for (const { parent, ...fields } of locations) {
    const doc = await upsert(
      CampusLocation,
      { university: university._id, slug: fields.slug },
      fields,
      stats.CampusLocation,
    );
    idBySlug.set(doc.slug, doc._id);
  }

  const missing = locations
    .filter((el) => el.parent && !idBySlug.has(el.parent))
    .map((el) => el.parent);
  if (missing.length) {
    const existing = await CampusLocation.find({
      university: university._id,
      slug: mongoose.trusted({ $in: missing }),
    }).select('_id slug');
    existing.forEach((el) => idBySlug.set(el.slug, el._id));
  }

  for (const loc of locations) {
    const doc = await CampusLocation.findOne({ university: university._id, slug: loc.slug });
    const parentId = loc.parent ? idBySlug.get(loc.parent) : undefined;
    if (String(doc.parent ?? '') !== String(parentId ?? '')) {
      doc.parent = parentId;
      await doc.save();
    }
  }

  return idBySlug;
}

async function importHostels(bundle, university, locationIds, stats) {
  for (const { location, ...fields } of bundle.hostels ?? []) {
    let locationId;
    if (location) {
      locationId =
        locationIds.get(location) ??
        (await CampusLocation.findOne({ university: university._id, slug: location }).select('_id'))
          ?._id;
    }
    await upsert(
      Hostel,
      { university: university._id, slug: fields.slug },
      { ...fields, location: locationId },
      stats.Hostel,
    );
  }
}

async function importNpcs(bundle, university, stats) {
  for (const fields of bundle.npcs ?? []) {
    await upsert(Npc, { university: university._id, key: fields.key }, fields, stats.Npc);
  }
}

async function importPositions(bundle, university, stats) {
  for (const fields of bundle.leadershipPositions ?? []) {
    await upsert(
      LeadershipPosition,
      { university: university._id, code: fields.code },
      fields,
      stats.LeadershipPosition,
    );
  }
}

/* eslint-enable no-await-in-loop */

/**
 * Validate and (unless dryRun) import a bundle.
 * Returns { valid, dryRun, isNewUniversity, errors, warnings, summary, results? }.
 */
export async function importBundle(raw, { dryRun = false } = {}) {
  const { report } = await preflightBundle(raw);
  const base = {
    valid: report.valid,
    dryRun,
    isNewUniversity: report.isNewUniversity,
    errors: report.errors,
    warnings: report.warnings,
    summary: report.summary,
  };
  if (!report.valid || dryRun) return base;

  const { bundle } = report;
  const stats = Object.fromEntries(
    [
      'University',
      'Faculty',
      'Department',
      'Programme',
      'AcademicSession',
      'CampusLocation',
      'Hostel',
      'LeadershipPosition',
      'Npc',
    ].map((key) => [key, newStats()]),
  );

  const { slug, ...universityFields } = bundle.university;
  const university = await upsert(University, { slug }, universityFields, stats.University);

  await importAcademics(bundle, university, stats);
  await importSessions(bundle, university, stats);
  const locationIds = await importLocations(bundle, university, stats);
  await importHostels(bundle, university, locationIds, stats);
  await importPositions(bundle, university, stats);
  await importNpcs(bundle, university, stats);

  return { ...base, results: stats };
}
