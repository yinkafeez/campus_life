import mongoose from '../../core/db/mongoose.js';
import { codeField, nameField, universityRef } from '../../core/db/schemaTypes.js';
import { verificationField } from '../../core/db/verification.js';
import { eligibilityRulesSchema } from '../../shared/eligibility.js';

// what a position leads: the whole university, one faculty, one department, or one hall
export const POSITION_SCOPES = ['university', 'faculty', 'department', 'hall'];

// a student leadership office, e.g. Students' Union President or Hall Chairman.
// Elections themselves arrive in a later phase; this is the catalogue + rules.
const leadershipPositionSchema = new mongoose.Schema(
  {
    university: universityRef(),
    code: codeField('position'),
    title: nameField('position'),
    // the organisation it belongs to, e.g. "Students' Union", "Students' Representative Council"
    body: { type: String, trim: true, maxlength: 120 },
    scope: {
      type: String,
      required: [true, 'A position must have a scope'],
      enum: {
        values: POSITION_SCOPES,
        message: 'Scope is either: university, faculty, department or hall',
      },
    },
    // how many people hold it at once (e.g. several hall representatives)
    seats: { type: Number, default: 1, min: 1, max: 100 },
    termLengthSessions: { type: Number, default: 1, min: 1, max: 4 },
    isElected: { type: Boolean, default: true },
    // candidate rules for this position (tighter than the university default if needed)
    candidateEligibility: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    // game privileges of the office (empty = the scope default in config.leadership)
    privileges: { type: [String], default: undefined },
    // display order within the scope (president first...)
    rank: { type: Number, default: 100, min: 0 },
    verification: verificationField(),
  },
  { timestamps: true, minimize: false },
);

leadershipPositionSchema.index({ university: 1, code: 1 }, { unique: true });
leadershipPositionSchema.index({ university: 1, scope: 1, rank: 1 });

// validate the rule format (values vs the university's levels/scale are checked on import)
leadershipPositionSchema.pre('validate', function () {
  if (!this.isModified('candidateEligibility')) return;
  const result = eligibilityRulesSchema.safeParse(this.candidateEligibility ?? {});
  if (!result.success) {
    result.error.issues.forEach((issue) =>
      this.invalidate(['candidateEligibility', ...issue.path].join('.'), issue.message),
    );
    return;
  }
  this.candidateEligibility = result.data;
});

const LeadershipPosition = mongoose.model('LeadershipPosition', leadershipPositionSchema);

export default LeadershipPosition;
