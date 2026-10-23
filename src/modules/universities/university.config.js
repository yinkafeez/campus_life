import { z } from 'zod';
import { eligibilityRuleProblems, eligibilityRulesSchema } from '../../shared/eligibility.js';

/*
 * University configuration — everything that differs between universities lives here,
 * as data. Shared business logic reads these values; it never checks "is this UNILAG?".
 *
 * Bump CONFIG_SCHEMA_VERSION when the shape changes. New sections always have defaults,
 * so older configs keep parsing (v1 → v2 added levels, grading, accommodation,
 * academicActivities and elections; v3 added matric formatVersion/startAt/onExhausted,
 * code-token widths, admission and onboarding; v4 added world zones; v5 added game
 * progression rules; v6 added election timeline/tie-break/campaign rules and leadership
 * privileges; v7 added onboarding steps per student type (freshers / stalites) and the
 * stalite hall choice).
 */
export const CONFIG_SCHEMA_VERSION = 7;

export const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─── Matric number format ─────────────────────────────────────────────────
// a template made of literal text and tokens, e.g. "CL-{yy}{facultyCode:2}{departmentCode:2}{seq:3}"
//   {yy} {yyyy}                    entry year of the student's first session
//   {facultyCode[:N]} ...          the unit's matricCode (or code); :N = must be exactly N characters
//   {seq:N}                        running serial, zero-padded to N digits
export const MATRIC_TOKENS = [
  'yy',
  'yyyy',
  'facultyCode',
  'departmentCode',
  'programmeCode',
  'seq',
];
const WIDTH_TOKENS = ['facultyCode', 'departmentCode', 'programmeCode', 'seq'];
export const SEQUENCE_SCOPES = ['university', 'faculty', 'department', 'programme'];
export const EXHAUSTION_POLICIES = ['reject'];

export const TOKEN_PATTERN = /\{([A-Za-z]+)(?::(\d+))?\}/g;

/** The tokens of a template: [{ name, width }] in order. */
export const templateTokens = (template) =>
  [...template.matchAll(TOKEN_PATTERN)].map(([, name, width]) => ({
    name,
    width: width ? Number(width) : undefined,
  }));

/** Problems with a matric template ([] means valid). */
export function matricTemplateProblems(template) {
  const problems = [];
  const tokens = [...template.matchAll(TOKEN_PATTERN)];

  tokens.forEach(([, name, width]) => {
    if (!MATRIC_TOKENS.includes(name)) problems.push(`Unknown token {${name}}`);
    if (name === 'seq' && !(Number(width) >= 1 && Number(width) <= 8))
      problems.push('{seq:N} needs a width N between 1 and 8');
    if (width && !WIDTH_TOKENS.includes(name)) problems.push(`{${name}} does not take a width`);
    if (width && name !== 'seq' && !(Number(width) >= 1 && Number(width) <= 10))
      problems.push(`{${name}:N} needs a width N between 1 and 10`);
  });

  const seqCount = tokens.filter(([, name]) => name === 'seq').length;
  if (seqCount !== 1) problems.push('The template must contain exactly one {seq:N} token');

  // anything left after removing tokens must be plain separators/letters/digits
  const literal = template.replace(TOKEN_PATTERN, '');
  if (/[{}]/.test(literal)) problems.push('The template has an unclosed or malformed token');
  if (!/^[A-Za-z0-9/._-]*$/.test(literal))
    problems.push('Literal text may only contain letters, digits and / . _ -');

  return problems;
}

const matricNumberSchema = z
  .object({
    template: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .superRefine((template, ctx) => {
        matricTemplateProblems(template).forEach((message) =>
          ctx.addIssue({ code: 'custom', message }),
        );
      }),
    // which group a running sequence number is counted within
    sequenceScope: z.enum(SEQUENCE_SCOPES).default('department'),
    // bump when the template changes: serials restart per format version, and every
    // student record remembers which version issued its number
    formatVersion: z.number().int().min(1).max(1000).default(1),
    // first serial issued in each sequence
    startAt: z.number().int().min(0).default(1),
    // what happens when {seq:N} runs out (e.g. the 1000th student with {seq:3})
    onExhausted: z.enum(EXHAUSTION_POLICIES).default('reject'),
  })
  .strict();

// ─── Academic calendar ────────────────────────────────────────────────────
const academicCalendarSchema = z
  .object({
    semesterNames: z.array(z.string().trim().min(1).max(40)).min(1).max(4),
  })
  .strict();

// ─── Levels & grading ─────────────────────────────────────────────────────
const levelsSchema = z
  .object({
    // e.g. [100, 200, 300, 400, 500] — a 4-year programme runs through the first four
    values: z
      .array(z.number().int().min(1).max(1000))
      .min(1)
      .max(12)
      .refine((vals) => vals.every((el, i) => i === 0 || el > vals[i - 1]), {
        message: 'Levels must be unique and in ascending order',
      }),
    // how a level is shown to players: "{level}L" → "200L"
    labelFormat: z
      .string()
      .trim()
      .max(20)
      .refine((val) => val.includes('{level}'), { message: 'labelFormat must contain {level}' })
      .default('{level}L'),
  })
  .strict();

const gradingSchema = z
  .object({
    cgpaScale: z.number().positive().max(10).default(5),
  })
  .strict();

// ─── Accommodation ────────────────────────────────────────────────────────
export const ALLOCATION_STRATEGIES = ['first-come', 'lottery', 'priority'];
export const PRIORITY_GROUPS = [
  'freshers',
  'finalists',
  'scholars',
  'students-with-disabilities',
  'athletes',
  'student-leaders',
  'international',
];

const accommodationSchema = z
  .object({
    allocationStrategy: z.enum(ALLOCATION_STRATEGIES).default('first-come'),
    // groups served first (in this order) when the strategy is "priority"
    priorityGroups: z
      .array(z.enum(PRIORITY_GROUPS))
      .refine((vals) => new Set(vals).size === vals.length, { message: 'Duplicate priority group' })
      .default([]),
    applicationRequired: z.boolean().default(true),
    genderSeparated: z.boolean().default(true),
    maxSessionsPerStudent: z.number().int().positive().max(10).optional(),
    // returning students ("stalites", who enter above the lowest entry level) pick their
    // hall directly instead of applying to the ballot
    returningStudentsChoose: z.boolean().default(true),
  })
  .strict();

// ─── Academic activities ──────────────────────────────────────────────────
export const ACTIVITY_KINDS = [
  'lecture',
  'tutorial',
  'practical',
  'test',
  'exam',
  'assignment',
  'project',
  'seminar',
  'field-trip',
];

const academicActivitiesSchema = z
  .object({
    types: z
      .array(
        z
          .object({
            key: z.string().trim().max(40).regex(KEY_PATTERN, 'key must be kebab-case'),
            name: z.string().trim().min(2).max(60),
            kind: z.enum(ACTIVITY_KINDS),
            graded: z.boolean().default(false),
            // share of a course's final score, when graded
            weightPercent: z.number().min(0).max(100).optional(),
          })
          .strict(),
      )
      .max(30)
      .refine((vals) => new Set(vals.map((el) => el.key)).size === vals.length, {
        message: 'Activity keys must be unique',
      })
      .default([]),
  })
  .strict();

// ─── Elections ────────────────────────────────────────────────────────────
export const VOTING_METHODS = ['first-past-the-post'];
export const TIE_BREAKS = ['drawing-of-lots', 'earliest-nomination'];
// how the CGPA rules in eligibility are evaluated in the game (the game has no real CGPA)
export const ACADEMIC_STANDING_SOURCES = ['game-standing', 'ignore'];

const DEFAULT_DEBATE_QUESTIONS = [
  'What is the first thing you will do if elected?',
  'How will you make sure every student can reach you?',
  'How will you spend the welfare budget fairly?',
];

const electionsSchema = z
  .object({
    votingMethod: z.enum(VOTING_METHODS).default('first-past-the-post'),
    nominationDays: z.number().int().min(1).max(30).default(3),
    campaignDays: z.number().int().min(1).max(60).default(14),
    votingHours: z.number().int().min(1).max(168).default(24),
    // complaints can be filed this long after voting closes; results are certified after it
    disputeHours: z.number().int().min(0).max(168).default(24),
    tieBreak: z.enum(TIE_BREAKS).default('drawing-of-lots'),
    academicStanding: z.enum(ACADEMIC_STANDING_SOURCES).default('game-standing'),
    // who may vote / stand by default (positions can tighten candidate rules)
    voterEligibility: eligibilityRulesSchema.prefault({}),
    defaultCandidateEligibility: eligibilityRulesSchema.prefault({}),
    campaign: z
      .object({
        maxPosters: z.number().int().min(0).max(20).default(3),
        maxSpeeches: z.number().int().min(0).max(20).default(3),
        maxEvents: z.number().int().min(0).max(20).default(3),
        maxVolunteers: z.number().int().min(0).max(500).default(30),
        debateQuestions: z
          .array(z.string().trim().min(5).max(200))
          .max(10)
          .default(DEFAULT_DEBATE_QUESTIONS),
      })
      .strict()
      .prefault({}),
  })
  .strict();

// ─── Leadership privileges (what elected leaders may do in the game) ──────
export const LEADER_PRIVILEGES = ['announce', 'official-event', 'welfare-grant'];
const byScope = (value) =>
  z.object({ university: value, faculty: value, department: value, hall: value }).strict();

const leadershipSchema = z
  .object({
    // default privileges per scope; a position can override with its own list
    privilegesByScope: byScope(z.array(z.enum(LEADER_PRIVILEGES)).max(10)).prefault({
      university: ['announce', 'official-event', 'welfare-grant'],
      faculty: ['announce', 'official-event', 'welfare-grant'],
      department: ['announce', 'official-event'],
      hall: ['announce', 'welfare-grant'],
    }),
    // game-funded weekly welfare budget per office (Campus Coins), by scope
    welfareBudgetPerWeek: byScope(z.number().int().min(0).max(100_000)).prefault({
      university: 600,
      faculty: 300,
      department: 150,
      hall: 150,
    }),
    maxGrantPerStudentPerWeek: z.number().int().min(1).max(10_000).default(50),
    announcementsPerDay: z.number().int().min(1).max(50).default(3),
  })
  .strict();

// ─── Simulated admission (game only — never a real admission) ─────────────
export const OFFER_POLICIES = ['auto-offer'];
export const DEFAULT_ADMISSION_DISCLAIMER =
  'This is a simulated game admission. It is not an offer of admission to any real university and does not create an official student record.';

const admissionSchema = z
  .object({
    // levels a new player may start at (UTME-style 100L, direct entry 200L...). Empty = the first level.
    entryLevels: z.array(z.number().int().positive()).max(12).default([]),
    // how long the simulated "review" takes before an offer appears
    reviewSeconds: z.number().int().min(0).max(3600).default(10),
    offerPolicy: z.enum(OFFER_POLICIES).default('auto-offer'),
    disclaimer: z.string().trim().min(20).max(500).default(DEFAULT_ADMISSION_DISCLAIMER),
  })
  .strict();

// ─── Fresher onboarding ───────────────────────────────────────────────────
const STUDENT_TYPES_FOR = ['everyone', 'freshers', 'stalites'];
const onboardingStepSchema = z
  .object({
    key: z.string().trim().max(40).regex(KEY_PATTERN, 'key must be kebab-case'),
    title: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300).optional(),
    // campus location slug the step happens at (completed by arriving there in the 3D world)
    location: z.string().trim().max(80).regex(KEY_PATTERN).optional(),
    // who does this step: freshers (entering at the lowest level), stalites (returning
    // students entering above it), or everyone
    for: z.enum(STUDENT_TYPES_FOR).default('everyone'),
    // "hostel": completed by getting a bed space (e.g. a stalite choosing their hall)
    kind: z.enum(['visit', 'hostel', 'task']).optional(),
  })
  .strict();

export const STUDENT_TYPES = ['fresher', 'stalite'];

const DEFAULT_ONBOARDING_STEPS = [
  {
    key: 'collect-id-card',
    title: 'Collect your game student ID card',
    description: 'Your in-game ID shows your fictional matric number.',
  },
  {
    key: 'register-courses',
    title: 'Register your first-semester courses',
    description: 'Pick the courses for your programme and level.',
  },
  {
    key: 'explore-campus',
    title: 'Take a first walk around campus',
    description: 'Find the places you will use every day.',
  },
];

// ─── World (playable zones) ───────────────────────────────────────────────
// zone keys the 3D client can load for this university; startZone is where freshers arrive
const worldSchema = z
  .object({
    startZone: z.string().trim().max(60).regex(KEY_PATTERN).optional(),
    zones: z.array(z.string().trim().max(60).regex(KEY_PATTERN)).max(50).default([]),
  })
  .strict();

// ─── Game progression (Phase 10) — game XP only, never grades or credits ──
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

const progressionSchema = z
  .object({
    // what a player needs at their current level before moving up
    promotion: z
      .object({
        minXp: z.number().int().min(0).max(100_000).default(200),
        minPassedActivities: z.number().int().min(0).max(100).default(3),
        // missions marked requiredForPromotion in the learning pack must be complete
        requireMissions: z.boolean().default(true),
        // the fresher onboarding must be finished first
        requireOnboarding: z.boolean().default(true),
      })
      .strict()
      .prefault({}),
    // XP multiplier per activity difficulty
    difficultyMultipliers: z
      .object({
        easy: z.number().min(0).max(10).default(1),
        medium: z.number().min(0).max(10).default(1.5),
        hard: z.number().min(0).max(10).default(2),
      })
      .strict()
      .prefault({}),
    // XP kept when an activity is submitted after its due date (0 = no XP when late)
    latePenaltyPercent: z.number().int().min(0).max(100).default(50),
    disclaimer: z
      .string()
      .trim()
      .min(20)
      .max(400)
      .default(
        'Game activities are fictional practice for fun. They are not grades, credits, examinations or academic records of any real university.',
      ),
  })
  .strict();

const onboardingSchema = z
  .object({
    steps: z
      .array(onboardingStepSchema)
      .min(1)
      .max(20)
      .refine((vals) => new Set(vals.map((el) => el.key)).size === vals.length, {
        message: 'Onboarding step keys must be unique',
      })
      .default(DEFAULT_ONBOARDING_STEPS),
  })
  .strict();

export const universityConfigSchema = z
  .object({
    matricNumber: matricNumberSchema,
    academicCalendar: academicCalendarSchema,
    levels: levelsSchema.prefault({ values: [100, 200, 300, 400] }),
    grading: gradingSchema.prefault({}),
    accommodation: accommodationSchema.prefault({}),
    academicActivities: academicActivitiesSchema.prefault({}),
    elections: electionsSchema.prefault({}),
    admission: admissionSchema.prefault({}),
    onboarding: onboardingSchema.prefault({}),
    world: worldSchema.prefault({}),
    progression: progressionSchema.prefault({}),
    leadership: leadershipSchema.prefault({}),
  })
  .strict()
  // rules must use values the university actually has
  .superRefine((config, ctx) => {
    // (null-safe: zod may still run this when another section already failed)
    const levels = config.levels?.values ?? [];
    (config.admission?.entryLevels ?? []).forEach((level, i) => {
      if (levels.length && !levels.includes(level)) {
        ctx.addIssue({
          code: 'custom',
          path: ['admission', 'entryLevels', i],
          message: `Entry level ${level} is not one of the university's levels (${levels.join(', ')})`,
        });
      }
    });
    const context = { levels, cgpaScale: config.grading?.cgpaScale };
    ['voterEligibility', 'defaultCandidateEligibility'].forEach((key) => {
      eligibilityRuleProblems(config.elections?.[key], context).forEach((problem) =>
        ctx.addIssue({
          code: 'custom',
          path: ['elections', key, ...problem.path],
          message: problem.message,
        }),
      );
    });
  });

/** Levels a new player may start at (defaults to the university's first level). */
export const entryLevelsOf = (config) =>
  config.admission?.entryLevels?.length ? config.admission.entryLevels : [config.levels.values[0]];

/** Display label for a level, e.g. levelLabel(config, 200) → "200L". */
export const levelLabel = (config, level) =>
  config.levels.labelFormat.replaceAll('{level}', String(level));

/**
 * "fresher" — entered at the university's lowest entry level (100L);
 * "stalite" — a returning student entering above it (e.g. 200L direct entry).
 */
export const studentTypeOf = (config, entryLevel) =>
  entryLevel > Math.min(...entryLevelsOf(config)) ? 'stalite' : 'fresher';

/** The onboarding steps a student of this type does (everyone's + their type's). */
export const onboardingStepsFor = (config, type) =>
  config.onboarding.steps.filter((step) => step.for === 'everyone' || step.for === `${type}s`);

/** Validate + normalise a config object. Returns zod's safeParse result. */
export const parseUniversityConfig = (config) => universityConfigSchema.safeParse(config);
