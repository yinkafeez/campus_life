import { z } from 'zod';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import University from '../universities/university.model.js';
import CampusLocation from '../campus/campusLocation.model.js';
import { GAME_TYPES } from './types/index.js';
import { triviaContentSchema } from './types/trivia.js';
import {
  EventSchedule,
  GAME_ACHIEVEMENT_CRITERIA,
  GameAchievement,
  GameContent,
} from './games.models.js';

/*
 * Games pack (data/games/<slug>.json): game content (trivia bank, reward tables),
 * scheduled campus competitions and game achievements. Validated + imported idempotently.
 */
const key = z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN, 'must be kebab-case');
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const rewards = z
  .array(
    z
      .object({
        rank: z.number().int().min(1).max(100),
        coins: z.number().int().min(1).max(10_000),
      })
      .strict(),
  )
  .max(20)
  .default([]);

const contentSchemas = { trivia: triviaContentSchema, penalties: z.object({}).strict() };

const packSchema = z
  .object({
    formatVersion: z.literal(1),
    university: key,
    notes: z.string().optional(),
    content: z.record(
      z.string(),
      z
        .object({
          rewards: z
            .object({
              solo: z
                .object({
                  perPoints: z.number().int().min(1).optional(),
                  perGoal: z.number().int().min(0).optional(),
                })
                .strict()
                .default({}),
              duelWin: z.number().int().min(0).max(1000).default(0),
              duelDraw: z.number().int().min(0).max(1000).default(0),
            })
            .strict(),
          content: z.record(z.string(), z.unknown()),
        })
        .strict(),
    ),
    schedules: z
      .array(
        z
          .object({
            key,
            title: z.string().trim().min(3).max(120),
            description: z.string().trim().max(400).optional(),
            type: z.string(),
            location: key.optional(),
            teams: z.enum(['solo', 'groups']).default('solo'),
            teamSize: z.number().int().min(1).max(10).default(3),
            maxAttempts: z.number().int().min(1).max(20).default(3),
            recurrence: z.union([
              z
                .object({
                  type: z.literal('weekly'),
                  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
                  start: z.string().regex(TIME, 'HH:MM'),
                  durationMinutes: z.number().int().min(15).max(1440),
                })
                .strict(),
              z
                .object({
                  type: z.literal('once'),
                  startsAt: z.iso.datetime({ offset: true }),
                  endsAt: z.iso.datetime({ offset: true }),
                })
                .strict(),
            ]),
            rewards,
            status: z.enum(['active', 'retired']).default('active'),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    achievements: z
      .array(
        z
          .object({
            key,
            title: z.string().trim().min(2).max(80),
            description: z.string().trim().max(300).optional(),
            criteria: z
              .object({
                type: z.enum(GAME_ACHIEVEMENT_CRITERIA),
                count: z.number().int().min(1).max(100_000),
              })
              .strict(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();

export async function validateGamesPack(raw) {
  const parsed = packSchema.safeParse(raw);
  if (!parsed.success)
    return {
      valid: false,
      errors: parsed.error.issues.map((el) => ({ path: el.path.join('.'), message: el.message })),
    };
  const pack = parsed.data;
  const errors = [];
  const university = await University.findOne({ slug: pack.university });
  if (!university)
    errors.push({
      path: 'university',
      message: `Import the university "${pack.university}" first`,
    });
  Object.entries(pack.content).forEach(([type, entry]) => {
    if (!GAME_TYPES[type])
      return errors.push({ path: `content.${type}`, message: `Unknown game type "${type}"` });
    const result = contentSchemas[type].safeParse(entry.content);
    if (!result.success)
      result.error.issues.forEach((el) =>
        errors.push({ path: `content.${type}.content.${el.path.join('.')}`, message: el.message }),
      );
    else entry.content = result.data;
  });
  const locations = university
    ? new Set(await CampusLocation.distinct('slug', { university: university._id }))
    : new Set();
  pack.schedules.forEach((s, i) => {
    if (!GAME_TYPES[s.type])
      errors.push({ path: `schedules.${i}.type`, message: `Unknown game type "${s.type}"` });
    else if (!pack.content[s.type])
      errors.push({
        path: `schedules.${i}.type`,
        message: `No content for "${s.type}" in this pack`,
      });
    if (s.location && university && !locations.has(s.location))
      errors.push({ path: `schedules.${i}.location`, message: `Unknown location "${s.location}"` });
    if (
      s.recurrence.type === 'once' &&
      new Date(s.recurrence.endsAt) <= new Date(s.recurrence.startsAt)
    ) {
      errors.push({ path: `schedules.${i}.recurrence`, message: 'endsAt must be after startsAt' });
    }
  });
  return {
    valid: errors.length === 0,
    errors,
    pack,
    university,
    summary: {
      games: Object.keys(pack.content),
      schedules: pack.schedules.length,
      achievements: pack.achievements.length,
    },
  };
}

export async function importGamesPack(raw, { dryRun = false } = {}) {
  const report = await validateGamesPack(raw);
  const { pack, university, ...rest } = report;
  if (!report.valid || dryRun) return { ...rest, dryRun };
  const scope = { university: university._id };
  const results = { GameContent: 0, EventSchedule: 0, GameAchievement: 0 };
  /* eslint-disable no-await-in-loop -- small pack */
  for (const [gameType, entry] of Object.entries(pack.content)) {
    await GameContent.updateOne(
      { ...scope, gameType },
      { $set: { content: entry.content, rewards: entry.rewards } },
      { upsert: true },
    );
    results.GameContent += 1;
  }
  for (const { key: k, ...fields } of pack.schedules) {
    await EventSchedule.updateOne(
      { ...scope, key: k },
      { $set: fields },
      { upsert: true, runValidators: true },
    );
    results.EventSchedule += 1;
  }
  for (const { key: k, ...fields } of pack.achievements) {
    await GameAchievement.updateOne(
      { ...scope, key: k },
      { $set: fields },
      { upsert: true, runValidators: true },
    );
    results.GameAchievement += 1;
  }
  /* eslint-enable no-await-in-loop */
  return { ...rest, dryRun, results };
}
