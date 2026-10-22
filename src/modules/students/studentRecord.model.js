import { randomUUID } from 'node:crypto';
import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';
import sameUniversity from '../../core/db/plugins/sameUniversity.js';

/*
 * A player's SIMULATED studentship at one university — game data only.
 * It is never an admission to a real university and never an official student record.
 *
 * Journey: under_review → offered → accepted → matriculated → active (onboarding done)
 *                                 ↘ declined (the player may apply again)
 *          active → graduated (passed the final level of the game's progression)
 */
export const STUDENT_STATUSES = [
  'under_review',
  'offered',
  'accepted',
  'declined',
  'matriculated',
  'active',
  'graduated',
];

const unitRef = (model, label) => ({
  type: mongoose.Schema.ObjectId,
  ref: model,
  required: [true, `A student record must have a ${label}`],
});

const completedStepSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    completedAt: { type: Date, required: true },
  },
  { _id: false },
);

const studentRecordSchema = new mongoose.Schema(
  {
    // internal, immutable id — the matric number is only a display number and may follow
    // a university's format rules; this id never changes
    studentId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      default: () => `stu_${randomUUID()}`,
    },
    player: {
      type: mongoose.Schema.ObjectId,
      ref: 'Player',
      required: true,
      unique: true, // one studentship per player (for now)
      immutable: true,
    },
    university: universityRef(),
    faculty: unitRef('Faculty', 'faculty'),
    department: unitRef('Department', 'department'),
    programme: unitRef('Programme', 'programme'),
    entryLevel: { type: Number, required: true, min: 1 },
    // advanced by the game's academic progression, never inferred from the calendar
    currentLevel: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: { values: STUDENT_STATUSES, message: 'Unknown student status: {VALUE}' },
      default: 'under_review',
    },
    admission: {
      appliedAt: { type: Date, required: true },
      reviewCompletesAt: { type: Date, required: true },
      offeredAt: Date,
      respondedAt: Date,
    },
    entrySession: { type: mongoose.Schema.ObjectId, ref: 'AcademicSession' },
    currentSession: { type: mongoose.Schema.ObjectId, ref: 'AcademicSession' },
    // FICTIONAL game number, allocated on the server only
    matricNumber: { type: String, trim: true, maxlength: 60 },
    matricFormatVersion: Number,
    matriculatedAt: Date,
    // game progression: when the player passed the final level (status "graduated")
    graduatedAt: Date,
    onboarding: {
      completedSteps: { type: [completedStepSchema], default: [] },
      completedAt: Date,
    },
    // explicit marker carried with every record and API response
    isSimulated: { type: Boolean, default: true, immutable: true },
  },
  { timestamps: true },
);

// a matric number is unique within its university (only set once matriculated)
studentRecordSchema.index(
  { university: 1, matricNumber: 1 },
  { unique: true, partialFilterExpression: { matricNumber: { $type: 'string' } } },
);
studentRecordSchema.index({ university: 1, status: 1 });

// once issued, a matric number never changes (it may only go from empty → set)
studentRecordSchema.post('init', function () {
  this.$locals.issuedMatric = this.matricNumber;
});

studentRecordSchema.path('matricNumber').validate(function (val) {
  // (update validators run with a Query as `this` — atomic updates guard with filters instead)
  const issued = this?.$locals?.issuedMatric;
  return !issued || val === issued;
}, 'A matric number cannot be changed once issued');

// every academic unit must belong to the record's university
studentRecordSchema.plugin(sameUniversity, { path: 'faculty', model: 'Faculty' });
studentRecordSchema.plugin(sameUniversity, { path: 'department', model: 'Department' });
studentRecordSchema.plugin(sameUniversity, { path: 'programme', model: 'Programme' });

const StudentRecord = mongoose.model('StudentRecord', studentRecordSchema);

export default StudentRecord;
