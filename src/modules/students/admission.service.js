import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import University from '../universities/university.model.js';
import { entryLevelsOf, levelLabel } from '../universities/university.config.js';
import Faculty from '../academics/faculty.model.js';
import Department from '../academics/department.model.js';
import Programme from '../academics/programme.model.js';
import AcademicSession from '../academics/academicSession.model.js';
import StudentRecord from './studentRecord.model.js';
import Discovery from '../campus/discovery.model.js';
import { allocateMatricNumber } from './matric.service.js';

/*
 * SIMULATED ADMISSION — the player's journey into (game) university life.
 * Every rule comes from the university's config; nothing here knows which university it is.
 *
 *   apply → under_review ──(config.admission.reviewSeconds)──▶ offered
 *   offered → accept → accepted → matriculate → matriculated → onboarding steps → active
 *   offered → decline → declined (the player may apply again)
 */

const invalidState = (message) => new AppError(message, 409, 'INVALID_STUDENT_STATE');

// the levels a programme runs through (first durationYears levels of the university)
export const programmeLevels = (config, programme) =>
  config.levels.values.slice(0, programme.durationYears);

/** The player's record (or null), with a due review turned into an offer. */
export async function findRecordForPlayer(playerId) {
  const record = await StudentRecord.findOne({ player: playerId });
  if (!record) return null;

  // the simulated review finishes lazily, the first time anyone looks after it's due
  if (record.status === 'under_review' && record.admission.reviewCompletesAt <= new Date()) {
    const offered = await StudentRecord.findOneAndUpdate(
      { _id: record._id, status: 'under_review' },
      { $set: { status: 'offered', 'admission.offeredAt': record.admission.reviewCompletesAt } },
      { returnDocument: 'after' },
    );
    return offered ?? StudentRecord.findById(record._id);
  }
  return record;
}

/** Resolve and check the player's choices against the university's configured options. */
async function resolveChoices({
  universitySlug,
  facultyCode,
  departmentCode,
  programmeCode,
  entryLevel,
}) {
  const university = await University.findOne({ slug: universitySlug, status: 'active' });
  if (!university)
    throw new AppError('That university is not available.', 404, 'UNIVERSITY_NOT_FOUND');

  const faculty = await Faculty.findOne({ university: university._id, code: facultyCode });
  const department =
    faculty &&
    (await Department.findOne({
      university: university._id,
      faculty: faculty._id,
      code: departmentCode,
    }));
  const programme =
    department &&
    (await Programme.findOne({
      university: university._id,
      department: department._id,
      code: programmeCode,
    }));

  const details = [];
  if (!faculty)
    details.push({ path: 'facultyCode', message: 'Unknown faculty for this university' });
  else if (!department)
    details.push({ path: 'departmentCode', message: 'Unknown department for this faculty' });
  else if (!programme)
    details.push({ path: 'programmeCode', message: 'Unknown programme for this department' });

  if (programme) {
    const allowed = entryLevelsOf(university.config).filter((level) =>
      programmeLevels(university.config, programme).includes(level),
    );
    if (!allowed.includes(entryLevel)) {
      details.push({
        path: 'entryLevel',
        message: `Choose one of: ${allowed.map((el) => levelLabel(university.config, el)).join(', ')}`,
      });
    }
  }
  if (details.length) throw AppError.validation(details, 'Please check your admission choices.');

  return { university, faculty, department, programme };
}

/** Apply for (simulated) admission. A declined record can apply again. */
export async function applyForAdmission(player, choices) {
  const existing = await StudentRecord.findOne({ player: player._id });
  if (existing && existing.status !== 'declined') {
    throw new AppError('You have already applied.', 409, 'ALREADY_APPLIED');
  }

  const { university, faculty, department, programme } = await resolveChoices(choices);
  const now = new Date();
  const fields = {
    university: university._id,
    faculty: faculty._id,
    department: department._id,
    programme: programme._id,
    entryLevel: choices.entryLevel,
    currentLevel: choices.entryLevel,
    status: 'under_review',
    admission: {
      appliedAt: now,
      reviewCompletesAt: new Date(now.getTime() + university.config.admission.reviewSeconds * 1000),
    },
  };

  if (existing) {
    // a declined record can't move university (university is immutable) — start a fresh one
    await StudentRecord.deleteOne({ _id: existing._id, status: 'declined' });
  }
  return StudentRecord.create({ player: player._id, ...fields });
}

/** Accept or decline the offer. */
export async function respondToOffer(record, accept) {
  const updated = await StudentRecord.findOneAndUpdate(
    { _id: record._id, status: 'offered' },
    { $set: { status: accept ? 'accepted' : 'declined', 'admission.respondedAt': new Date() } },
    { returnDocument: 'after' },
  );
  if (!updated) throw invalidState('There is no admission offer to respond to.');
  return updated;
}

/** Matriculate: allocate the fictional matric number and start the first session. */
export async function matriculate(record) {
  if (record.status !== 'accepted') throw invalidState('Accept your admission offer first.');

  const [university, faculty, department, programme, session] = await Promise.all([
    University.findById(record.university),
    Faculty.findById(record.faculty),
    Department.findById(record.department),
    Programme.findById(record.programme),
    AcademicSession.findOne({ university: record.university, isCurrent: true }),
  ]);
  if (!session) {
    throw new AppError(
      'Matriculation is closed: this university has no current academic session.',
      409,
      'NO_CURRENT_SESSION',
    );
  }

  // a duplicate can only happen after an admin format change re-issues an old number — retry
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- each attempt needs the previous result
    const { matricNumber, formatVersion } = await allocateMatricNumber({
      university,
      faculty,
      department,
      programme,
      entrySession: session,
    });

    try {
      // atomic transition: a double-click can't matriculate twice
      // eslint-disable-next-line no-await-in-loop
      const updated = await StudentRecord.findOneAndUpdate(
        { _id: record._id, status: 'accepted' },
        {
          $set: {
            status: 'matriculated',
            matricNumber,
            matricFormatVersion: formatVersion,
            matriculatedAt: new Date(),
            entrySession: session._id,
            currentSession: session._id,
            currentLevel: record.entryLevel,
          },
        },
        { returnDocument: 'after', runValidators: true },
      );
      // someone else matriculated this record first: keep theirs (our serial becomes a gap)
      return updated ?? StudentRecord.findById(record._id);
    } catch (err) {
      if (err?.code !== 11000 || attempt === 3) throw err;
    }
  }
  throw new AppError('Could not allocate a matric number. Please try again.', 503, 'MATRIC_BUSY');
}

/**
 * Mark a fresher onboarding step as done; the last step makes the student active.
 * A step tied to a campus location only counts once the player has actually arrived there
 * in the 3D world (a recorded visit) — orientation is walked, not clicked.
 */
export async function completeOnboardingStep(record, stepKey) {
  if (!['matriculated', 'active'].includes(record.status)) {
    throw invalidState('Onboarding starts after matriculation.');
  }
  const university = await University.findById(record.university);
  const steps = university.config.onboarding.steps;
  const step = steps.find((el) => el.key === stepKey);
  if (!step) throw AppError.notFound('That onboarding step does not exist.');
  if (
    step.location &&
    !(await Discovery.exists({ player: record.player, locationSlug: step.location }))
  ) {
    throw new AppError(
      'Walk to this place on campus first — the step completes when you arrive.',
      409,
      'VISIT_REQUIRED',
    );
  }

  // $ne guard: completing the same step twice is a no-op
  await StudentRecord.updateOne(
    { _id: record._id, 'onboarding.completedSteps.key': mongoose.trusted({ $ne: stepKey }) },
    { $push: { 'onboarding.completedSteps': { key: stepKey, completedAt: new Date() } } },
  );

  const updated = await StudentRecord.findById(record._id);
  const done = new Set(updated.onboarding.completedSteps.map((el) => el.key));
  if (updated.status === 'matriculated' && steps.every((el) => done.has(el.key))) {
    return StudentRecord.findOneAndUpdate(
      { _id: record._id, status: 'matriculated' },
      { $set: { status: 'active', 'onboarding.completedAt': new Date() } },
      { returnDocument: 'after' },
    );
  }
  return updated;
}
