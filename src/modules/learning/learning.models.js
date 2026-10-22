import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';
import { verificationField } from '../../core/db/verification.js';
import { DIFFICULTIES } from '../universities/university.config.js';
import { ENGINE_KEYS } from './engines/index.js';

/*
 * GAME LEARNING — fictional practice activities, missions and achievements.
 * Game XP and "passes" here are NEVER grades, credits, examinations or academic records.
 * Definitions come from a university's learning pack (data/learning/<slug>.json).
 */

// who an activity / mission is for (codes from the university catalogue). All empty = everyone.
const targetsSchema = new mongoose.Schema(
  {
    faculties: { type: [String], default: [] },
    departments: { type: [String], default: [] },
    programmes: { type: [String], default: [] },
    levels: { type: [Number], default: [] },
  },
  { _id: false },
);

const activitySchema = new mongoose.Schema(
  {
    university: universityRef(),
    key: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    summary: { type: String, trim: true, maxlength: 400 },
    discipline: { type: String, trim: true, maxlength: 60 }, // display group: "Engineering", "Law"…
    engine: { type: String, required: true, enum: ENGINE_KEYS },
    targets: { type: targetsSchema, default: () => ({}) },
    difficulty: { type: String, enum: DIFFICULTIES, default: 'medium' },
    // engine-specific content (validated by the engine's schema on import); never sent as-is
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    scoring: {
      passPercent: { type: Number, min: 1, max: 100, default: 60 },
    },
    rewards: { xp: { type: Number, min: 0, max: 1000, default: 50 } },
    limits: {
      maxAttempts: { type: Number, min: 1, max: 20, default: 3 }, // per level
      timeLimitSeconds: { type: Number, min: 30, max: 7200 }, // optional
    },
    // optional deadline: N days after the player started their current level
    dueDays: { type: Number, min: 1, max: 365 },
    // optional absolute window
    opensAt: Date,
    closesAt: Date,
    // campus place this activity belongs to (for the world / directory)
    location: { type: String, trim: true, maxlength: 80 },
    // e.g. medicine: "Educational game content — not medical advice"
    notice: { type: String, trim: true, maxlength: 300 },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
    verification: verificationField(),
  },
  { timestamps: true, minimize: false },
);
activitySchema.index({ university: 1, key: 1 }, { unique: true });
activitySchema.index({ university: 1, status: 1 });

export const MISSION_STEP_TYPES = [
  'pass-activity', // ref: activity key
  'pass-activities', // count: any N activities passed at the current level
  'discover-location', // ref: location slug
  'discover-locations', // count: N discoveries
  'campus-activity', // ref: "location-slug/activity-key"
  'onboarding-complete',
];

const missionStepSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, maxlength: 40 },
    label: { type: String, required: true, maxlength: 160 },
    type: { type: String, required: true, enum: MISSION_STEP_TYPES },
    ref: { type: String, maxlength: 160 },
    count: { type: Number, min: 1, max: 100 },
  },
  { _id: false },
);

const missionSchema = new mongoose.Schema(
  {
    university: universityRef(),
    key: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    summary: { type: String, trim: true, maxlength: 400 },
    targets: { type: targetsSchema, default: () => ({}) },
    steps: { type: [missionStepSchema], default: [] },
    rewards: { xp: { type: Number, min: 0, max: 2000, default: 100 } },
    // must be complete (at the current level) before promotion
    requiredForPromotion: { type: Boolean, default: false },
    // repeatable once per level (e.g. "departmental week"), or once ever
    perLevel: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
  },
  { timestamps: true },
);
missionSchema.index({ university: 1, key: 1 }, { unique: true });

export const ACHIEVEMENT_CRITERIA = [
  'activities-passed',
  'perfect-scores',
  'missions-completed',
  'total-xp',
  'levels-completed',
];

const achievementSchema = new mongoose.Schema(
  {
    university: universityRef(),
    key: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    criteria: {
      type: { type: String, required: true, enum: ACHIEVEMENT_CRITERIA },
      count: { type: Number, required: true, min: 1, max: 100_000 },
    },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
  },
  { timestamps: true },
);
achievementSchema.index({ university: 1, key: 1 }, { unique: true });

// ─── Player data ──────────────────────────────────────────────────────────
export const ATTEMPT_STATUSES = ['started', 'submitted', 'expired'];

const attemptSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    university: universityRef(),
    activity: {
      type: mongoose.Schema.ObjectId,
      ref: 'LearningActivity',
      required: true,
      immutable: true,
    },
    activityKey: { type: String, required: true, immutable: true },
    level: { type: Number, required: true, immutable: true }, // the player's level at the time
    number: { type: Number, required: true, immutable: true }, // 1..maxAttempts within that level
    status: { type: String, enum: ATTEMPT_STATUSES, default: 'started' },
    open: { type: Boolean }, // true while started — one open attempt per player + activity
    seed: { type: Number, required: true, immutable: true },
    secret: { type: mongoose.Schema.Types.Mixed, select: false }, // engine presentation secret
    startedAt: { type: Date, default: () => new Date(), immutable: true },
    expiresAt: { type: Date, required: true },
    dueAt: Date,
    submittedAt: Date,
    answer: { type: mongoose.Schema.Types.Mixed, select: false },
    score: Number,
    maxScore: Number,
    percent: Number,
    passed: Boolean,
    late: Boolean,
    xpAwarded: { type: Number, default: 0 },
    result: mongoose.Schema.Types.Mixed, // engine feedback shown after submitting
  },
  { timestamps: true },
);
attemptSchema.index({ player: 1, activity: 1, level: 1, number: 1 }, { unique: true });
attemptSchema.index(
  { player: 1, activity: 1 },
  { unique: true, partialFilterExpression: { open: true }, name: 'one_open_attempt' },
);
attemptSchema.index({ player: 1, submittedAt: -1 });

const levelProgressSchema = new mongoose.Schema(
  {
    level: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    xp: { type: Number, default: 0 },
    // best result per activity at this level: { activityKey: { percent, xp, passed } }
    best: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    passed: { type: [String], default: [] },
    missions: { type: [String], default: [] }, // missions completed at this level
    completedAt: Date, // promoted out of this level
  },
  { _id: false, minimize: false },
);

const progressSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    university: universityRef(),
    totalXp: { type: Number, default: 0 },
    perfectScores: { type: Number, default: 0 },
    levels: { type: [levelProgressSchema], default: [] },
    missionsCompleted: {
      type: [{ key: String, level: Number, completedAt: Date, _id: false }],
      default: [],
    },
    achievements: { type: [{ key: String, awardedAt: Date, _id: false }], default: [] },
    isSimulated: { type: Boolean, default: true, immutable: true },
  },
  { timestamps: true, minimize: false },
);
progressSchema.index({ player: 1, university: 1 }, { unique: true });

export const LearningActivity = mongoose.model('LearningActivity', activitySchema);
export const Mission = mongoose.model('Mission', missionSchema);
export const Achievement = mongoose.model('Achievement', achievementSchema);
export const ActivityAttempt = mongoose.model('ActivityAttempt', attemptSchema);
export const LearningProgress = mongoose.model('LearningProgress', progressSchema);
