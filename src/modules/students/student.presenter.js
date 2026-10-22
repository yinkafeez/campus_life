import University from '../universities/university.model.js';
import { levelLabel } from '../universities/university.config.js';
import Faculty from '../academics/faculty.model.js';
import Department from '../academics/department.model.js';
import Programme from '../academics/programme.model.js';
import AcademicSession from '../academics/academicSession.model.js';
import { programmeLevels } from './admission.service.js';

/*
 * The student dashboard view of a record. Always carries isSimulated + the university's
 * disclaimer, so no screen can show game data as if it were an official record.
 */
export async function presentStudent(record) {
  const [university, faculty, department, programme, session] = await Promise.all([
    University.findById(record.university).select('slug name shortName config'),
    Faculty.findById(record.faculty).select('code name'),
    Department.findById(record.department).select('code name'),
    Programme.findById(record.programme).select('code name award durationYears'),
    record.currentSession
      ? AcademicSession.findById(record.currentSession).select('name startsOn endsOn')
      : AcademicSession.findOne({ university: record.university, isCurrent: true }).select(
          'name startsOn endsOn',
        ),
  ]);
  const { config } = university;
  const label = (level) => ({ level, label: levelLabel(config, level) });

  // progression: the levels this programme runs through, from the student's entry level
  const levels = programmeLevels(config, programme).filter((el) => el >= record.entryLevel);
  const graduated = record.status === 'graduated';
  // a graduate has completed every level, including the last one
  const currentIndex = graduated ? levels.length : levels.indexOf(record.currentLevel);
  const studying = ['matriculated', 'active', 'graduated'].includes(record.status);

  const completedKeys = new Map(
    record.onboarding.completedSteps.map((el) => [el.key, el.completedAt]),
  );
  const steps = config.onboarding.steps.map((step) => ({
    ...step,
    completed: completedKeys.has(step.key),
    completedAt: completedKeys.get(step.key) ?? null,
  }));

  const reviewMs = record.admission.reviewCompletesAt.getTime() - Date.now();

  return {
    studentId: record.studentId,
    status: record.status,
    isSimulated: true,
    disclaimer: config.admission.disclaimer,
    university: { slug: university.slug, name: university.name, shortName: university.shortName },
    faculty,
    department,
    programme,
    entryLevel: label(record.entryLevel),
    currentLevel: label(record.currentLevel),
    session: session
      ? { name: session.name, startsOn: session.startsOn, endsOn: session.endsOn }
      : null,
    admission: {
      appliedAt: record.admission.appliedAt,
      reviewCompletesAt: record.admission.reviewCompletesAt,
      secondsUntilDecision:
        record.status === 'under_review' ? Math.max(0, Math.ceil(reviewMs / 1000)) : 0,
      offeredAt: record.admission.offeredAt ?? null,
      respondedAt: record.admission.respondedAt ?? null,
    },
    matric: record.matricNumber
      ? {
          number: record.matricNumber,
          label: 'Fictional game matric number',
          formatVersion: record.matricFormatVersion,
          issuedAt: record.matriculatedAt,
        }
      : null,
    onboarding: {
      steps,
      completed: steps.filter((el) => el.completed).length,
      total: steps.length,
      completedAt: record.onboarding.completedAt ?? null,
    },
    progress: {
      levels: levels.map((level, i) => ({
        ...label(level),
        state:
          !studying || i > currentIndex ? 'upcoming' : i === currentIndex ? 'current' : 'completed',
      })),
      yearOfStudy: studying ? Math.min(currentIndex + 1, levels.length) : 0,
      graduatedAt: record.graduatedAt ?? null,
      yearsTotal: levels.length,
      percent: studying && levels.length ? Math.round((currentIndex / levels.length) * 100) : 0,
    },
  };
}
