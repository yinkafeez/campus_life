import { z } from 'zod';
import { CODE_PATTERN, SLUG_PATTERN } from '../../../core/db/schemaTypes.js';
import { VERIFICATION_STATUSES } from '../../../core/db/verification.js';
import { DIFFICULTIES } from '../../universities/university.config.js';
import { ENGINE_KEYS } from '../engines/index.js';
import { ACHIEVEMENT_CRITERIA, MISSION_STEP_TYPES } from '../learning.models.js';

/*
 * A LEARNING PACK — one JSON document with a university's game activities, missions and
 * achievements. Admins import packs (CLI or admin API); new content needs no code change.
 * Engine content is checked separately by each engine's own schema (validatePack.js).
 */
export const PACK_FORMAT_VERSION = 1;

const key = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(SLUG_PATTERN, 'must be kebab-case (a-z, 0-9, single dashes)');
const code = z.string().trim().toUpperCase().regex(CODE_PATTERN, 'must be 2–10 letters or digits');

const targets = z
  .object({
    faculties: z.array(code).max(30).default([]),
    departments: z.array(code).max(60).default([]),
    programmes: z.array(code).max(60).default([]),
    levels: z.array(z.number().int().positive()).max(12).default([]),
  })
  .strict()
  .prefault({});

const isoDateTime = z.iso.datetime({ offset: true });

const activity = z
  .object({
    key,
    title: z.string().trim().min(3).max(120),
    summary: z.string().trim().max(400).optional(),
    discipline: z.string().trim().max(60).optional(),
    engine: z.enum(ENGINE_KEYS),
    targets,
    difficulty: z.enum(DIFFICULTIES).default('medium'),
    content: z.record(z.string(), z.unknown()),
    scoring: z
      .object({ passPercent: z.number().int().min(1).max(100).default(60) })
      .strict()
      .prefault({}),
    rewards: z
      .object({ xp: z.number().int().min(0).max(1000).default(50) })
      .strict()
      .prefault({}),
    limits: z
      .object({
        maxAttempts: z.number().int().min(1).max(20).default(3),
        timeLimitSeconds: z.number().int().min(30).max(7200).optional(),
      })
      .strict()
      .prefault({}),
    dueDays: z.number().int().min(1).max(365).optional(),
    opensAt: isoDateTime.optional(),
    closesAt: isoDateTime.optional(),
    location: key.optional(),
    notice: z.string().trim().max(300).optional(),
    status: z.enum(['active', 'retired']).default('active'),
    verification: z
      .object({
        status: z.enum(VERIFICATION_STATUSES).default('proposed'),
        notes: z.string().trim().max(1000).optional(),
      })
      .strict()
      .prefault({}),
  })
  .strict()
  .refine((a) => !a.opensAt || !a.closesAt || new Date(a.closesAt) > new Date(a.opensAt), {
    message: 'closesAt must be after opensAt',
    path: ['closesAt'],
  });

const missionStep = z
  .object({
    key,
    label: z.string().trim().min(2).max(160),
    type: z.enum(MISSION_STEP_TYPES),
    ref: z.string().trim().max(160).optional(),
    count: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const needsRef = ['pass-activity', 'discover-location', 'campus-activity'].includes(s.type);
    const needsCount = ['pass-activities', 'discover-locations'].includes(s.type);
    if (needsRef && !s.ref)
      ctx.addIssue({ code: 'custom', message: `A "${s.type}" step needs a ref`, path: ['ref'] });
    if (needsCount && !s.count)
      ctx.addIssue({
        code: 'custom',
        message: `A "${s.type}" step needs a count`,
        path: ['count'],
      });
  });

const mission = z
  .object({
    key,
    title: z.string().trim().min(3).max(120),
    summary: z.string().trim().max(400).optional(),
    targets,
    steps: z.array(missionStep).min(1).max(12),
    rewards: z
      .object({ xp: z.number().int().min(0).max(2000).default(100) })
      .strict()
      .prefault({}),
    requiredForPromotion: z.boolean().default(false),
    perLevel: z.boolean().default(false),
    status: z.enum(['active', 'retired']).default('active'),
  })
  .strict()
  .refine((m) => new Set(m.steps.map((s) => s.key)).size === m.steps.length, {
    message: 'Step keys must be unique',
  });

const achievement = z
  .object({
    key,
    title: z.string().trim().min(2).max(80),
    description: z.string().trim().max(300).optional(),
    criteria: z
      .object({ type: z.enum(ACHIEVEMENT_CRITERIA), count: z.number().int().min(1).max(100_000) })
      .strict(),
    status: z.enum(['active', 'retired']).default('active'),
  })
  .strict();

export const packSchema = z
  .object({
    formatVersion: z.literal(PACK_FORMAT_VERSION),
    university: key, // the university slug this pack belongs to
    activities: z.array(activity).max(500).default([]),
    missions: z.array(mission).max(200).default([]),
    achievements: z.array(achievement).max(200).default([]),
  })
  .strict();
