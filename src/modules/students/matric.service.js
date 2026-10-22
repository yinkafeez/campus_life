import AppError from '../../core/errors/AppError.js';
import { TOKEN_PATTERN, templateTokens } from '../universities/university.config.js';
import MatricSequence from './matricSequence.model.js';

/*
 * MATRIC NUMBER ALLOCATION — tenant-agnostic. Everything comes from the university's
 * config.matricNumber { template, sequenceScope, formatVersion, startAt, onExhausted }
 * and the academic units' matricCode/code.
 *
 * Numbers are FICTIONAL game numbers, generated on the server only.
 * - Serials come from an atomic $inc on a MatricSequence document → no duplicates under load.
 * - Uniqueness is also enforced by a unique index on StudentRecord {university, matricNumber}.
 * - A serial that would not fit {seq:N} is rejected (MATRIC_RANGE_EXHAUSTED); the sequence
 *   is never wrapped or reused. Abandoned serials leave gaps — that is expected.
 * - Changing the format: bump formatVersion → serials restart under the new version.
 */

const SCOPE_UNIT = {
  university: null,
  faculty: 'faculty',
  department: 'department',
  programme: 'programme',
};

const codeOf = (unit) => unit.matricCode || unit.code;

/** The sequence a student's serial is taken from. */
export function sequenceKey({ config, entryYear, faculty, department, programme }) {
  const scope = config.sequenceScope;
  const unit = { faculty, department, programme }[SCOPE_UNIT[scope]];
  return `v${config.formatVersion}:${entryYear}:${scope}:${unit ? String(unit._id) : 'all'}`;
}

/** Fill the template. Throws if a code doesn't fit a fixed-width token (an admin config error). */
export function renderMatricNumber(template, values) {
  return template.replace(TOKEN_PATTERN, (match, name, width) => {
    const value = String(values[name] ?? '');
    if (name === 'seq') return value.padStart(Number(width), '0');
    if (width && value.length !== Number(width)) {
      throw new AppError(
        `The matric format needs a ${width}-character ${name}, but "${value}" was configured.`,
        500,
        'MATRIC_CONFIG_INVALID',
      );
    }
    return value;
  });
}

/** Largest serial a template can show, e.g. {seq:3} → 999. */
export const maxSerial = (template) => {
  const seq = templateTokens(template).find((el) => el.name === 'seq');
  return 10 ** seq.width - 1;
};

/**
 * Take the next serial and build the matric number.
 * Returns { matricNumber, formatVersion, serial }.
 */
export async function allocateMatricNumber({
  university,
  faculty,
  department,
  programme,
  entrySession,
}) {
  const config = university.config.matricNumber;
  const entryYear = Number(entrySession.name.slice(0, 4));
  const key = sequenceKey({ config, entryYear, faculty, department, programme });

  // atomic: concurrent requests always get different values
  const sequence = await MatricSequence.findOneAndUpdate(
    { university: university._id, key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  const serial = config.startAt + sequence.value - 1;

  if (serial > maxSerial(config.template)) {
    // onExhausted: 'reject' is the only policy today; new policies plug in here
    throw new AppError(
      'No more matric numbers are available for this group this session. An administrator needs to update the matric format.',
      409,
      'MATRIC_RANGE_EXHAUSTED',
    );
  }

  const matricNumber = renderMatricNumber(config.template, {
    yy: String(entryYear).slice(-2),
    yyyy: String(entryYear),
    facultyCode: codeOf(faculty),
    departmentCode: codeOf(department),
    programmeCode: codeOf(programme),
    seq: serial,
  });

  return { matricNumber, formatVersion: config.formatVersion, serial };
}
