import { z } from 'zod';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import ItemDefinition from '../wardrobe/itemDefinition.model.js';
import { getEngine } from '../learning/engines/index.js';
import { EconomySettings, Hustle, SHOP_KINDS, ShopItem } from './economy.models.js';

/*
 * The economy catalogue: currency + rules, shop items and hustles (data/economy/global.json).
 * Validated as a whole (job tasks are checked by the learning engines) and imported
 * idempotently — the same JSON can be imported any number of times.
 */
const key = z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN, 'must be kebab-case');
const coins = (max) => z.number().int().min(1).max(max);

const itemSchema = z
  .object({
    key,
    name: z.string().trim().min(2).max(80),
    kind: z.enum(SHOP_KINDS),
    description: z.string().trim().max(300).optional(),
    price: coins(100_000),
    wardrobe: z.boolean().default(false),
    effects: z
      .object({ energy: z.number().int().min(1).max(100).optional() })
      .strict()
      .default({}),
    transferable: z.boolean().default(false),
    maxPerPurchase: z.number().int().min(1).max(50).default(10),
    status: z.enum(['active', 'retired']).default('active'),
  })
  .strict();

const jobSchema = z
  .object({
    key,
    client: z.string().trim().min(2).max(120),
    brief: z.string().trim().min(2).max(400),
    task: z.union([
      z.object({ type: z.literal('route') }).strict(),
      z.object({ engine: z.string(), content: z.record(z.string(), z.unknown()) }).strict(),
    ]),
  })
  .strict();

const hustleSchema = z
  .object({
    key,
    name: z.string().trim().min(2).max(80),
    category: z.string().trim().max(40).optional(),
    description: z.string().trim().max(400).optional(),
    requires: z.array(key).max(5).default([]),
    consumes: z
      .array(z.object({ itemKey: key, quantity: z.number().int().min(1).max(10) }).strict())
      .max(5)
      .default([]),
    energyCost: z.number().int().min(0).max(100).default(20),
    cooldownMinutes: z.number().int().min(0).max(1440).default(30),
    maxJobsPerDay: z.number().int().min(1).max(50).default(5),
    basePay: coins(10_000),
    passPercent: z.number().int().min(1).max(100).default(60),
    jobs: z.array(jobSchema).min(1).max(20),
    status: z.enum(['active', 'retired']).default('active'),
  })
  .strict();

export const economySchema = z
  .object({
    formatVersion: z.literal(1),
    notes: z.string().optional(),
    currency: z
      .object({ name: z.string().trim().min(2).max(40), symbol: z.string().trim().min(1).max(6) })
      .strict(),
    rules: z
      .object({
        welcomeGrant: z.number().int().min(0).max(100_000),
        weeklyAllowance: z.number().int().min(0).max(100_000),
        energy: z
          .object({
            max: z.number().int().min(10).max(1000),
            regenPerHour: z.number().min(0).max(1000),
          })
          .strict(),
        hostelWeeklyFee: z.number().int().min(0).max(100_000),
        dailyGamePrizeCap: z.number().int().min(0).max(100_000),
        jobMinutesToComplete: z.number().int().min(5).max(1440),
      })
      .strict(),
    items: z.array(itemSchema).max(500),
    hustles: z.array(hustleSchema).max(100),
  })
  .strict();

const issue = (path, message) => ({ path, message });

export async function validateEconomy(raw, { checkWardrobe = true } = {}) {
  const parsed = economySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((el) => issue(el.path.join('.'), el.message)),
    };
  }
  const data = parsed.data;
  const errors = [];
  const itemKeys = new Set();
  data.items.forEach((item, i) => {
    if (itemKeys.has(item.key))
      errors.push(issue(`items.${i}.key`, `Duplicate item "${item.key}"`));
    itemKeys.add(item.key);
    if (item.kind === 'food' && !item.effects.energy)
      errors.push(issue(`items.${i}.effects`, 'Food must restore energy'));
  });
  // wardrobe items must exist in the wardrobe catalogue; others must not collide with it
  if (checkWardrobe) {
    const wardrobeKeys = new Set(await ItemDefinition.distinct('key'));
    data.items.forEach((item, i) => {
      if (item.wardrobe && !wardrobeKeys.has(item.key))
        errors.push(issue(`items.${i}.key`, `No wardrobe item "${item.key}"`));
      if (!item.wardrobe && wardrobeKeys.has(item.key))
        errors.push(
          issue(`items.${i}.key`, `"${item.key}" is a wardrobe item; set wardrobe: true`),
        );
    });
  }
  const hustleKeys = new Set();
  data.hustles.forEach((hustle, i) => {
    if (hustleKeys.has(hustle.key))
      errors.push(issue(`hustles.${i}.key`, `Duplicate hustle "${hustle.key}"`));
    hustleKeys.add(hustle.key);
    [...hustle.requires, ...hustle.consumes.map((c) => c.itemKey)].forEach((k) => {
      if (!itemKeys.has(k)) errors.push(issue(`hustles.${i}`, `Unknown item "${k}"`));
    });
    const jobKeys = new Set();
    hustle.jobs.forEach((job, j) => {
      if (jobKeys.has(job.key))
        errors.push(issue(`hustles.${i}.jobs.${j}.key`, `Duplicate job "${job.key}"`));
      jobKeys.add(job.key);
      if (job.task.type === 'route') return;
      const engine = getEngine(job.task.engine);
      if (!engine)
        return errors.push(
          issue(`hustles.${i}.jobs.${j}.task.engine`, `Unknown engine "${job.task.engine}"`),
        );
      const content = engine.contentSchema.safeParse(job.task.content);
      if (!content.success) {
        content.error.issues.forEach((el) =>
          errors.push(
            issue(`hustles.${i}.jobs.${j}.task.content.${el.path.join('.')}`, el.message),
          ),
        );
      } else job.task.content = content.data;
    });
  });
  return {
    valid: errors.length === 0,
    errors,
    data,
    summary: { items: data.items.length, hustles: data.hustles.length },
  };
}

const newStats = () => ({ created: 0, updated: 0, unchanged: 0 });
async function upsert(Model, filter, values, stats) {
  const doc = (await Model.findOne(filter)) ?? new Model(filter);
  doc.set(values);
  if (doc.isNew) stats.created += 1;
  else if (doc.isModified()) stats.updated += 1;
  else return void (stats.unchanged += 1);
  await doc.save();
}

export async function importEconomy(raw, { dryRun = false } = {}) {
  const report = await validateEconomy(raw);
  if (!report.valid || dryRun) return { ...report, data: undefined, dryRun };
  const { currency, rules, items, hustles } = report.data;
  const results = { settings: newStats(), ShopItem: newStats(), Hustle: newStats() };
  await upsert(EconomySettings, { key: 'global' }, { currency, rules }, results.settings);
  /* eslint-disable no-await-in-loop -- small catalogue, readable sequential upserts */
  for (const { key: k, ...fields } of items)
    await upsert(ShopItem, { key: k }, fields, results.ShopItem);
  for (const { key: k, ...fields } of hustles)
    await upsert(Hustle, { key: k }, fields, results.Hustle);
  /* eslint-enable no-await-in-loop */
  return { ...report, data: undefined, dryRun, results };
}
