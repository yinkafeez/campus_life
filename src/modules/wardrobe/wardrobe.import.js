import { z } from 'zod';
import mongoose from '../../core/db/mongoose.js';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import ItemDefinition from './itemDefinition.model.js';
import WardrobeSettings from './wardrobeSettings.model.js';
import University from '../universities/university.model.js';
import { EQUIP_SLOTS, HEX_COLOR, ITEM_SLOTS, OCCASIONS } from './wardrobe.constants.js';

/*
 * Wardrobe data file (data/wardrobe/*.json): palettes, starter look, default outfits and the
 * item catalogue. Validated as a whole, then upserted by natural keys (idempotent).
 */
const slug = z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN, 'must be kebab-case');
const hex = z.string().trim().toLowerCase().regex(HEX_COLOR, 'must look like #a1b2c3');
const worn = z.object({ item: slug, color: hex.optional() }).strict();

export const slotsSchema = z
  .object(Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, worn.optional()])))
  .strict();

const paletteEntry = z.object({ key: slug, name: z.string().trim().min(1).max(40), hex }).strict();

const itemSchema = z
  .object({
    key: slug,
    name: z.string().trim().min(2).max(80),
    slot: z.enum(ITEM_SLOTS),
    meshKey: slug,
    occasions: z.array(z.enum(OCCASIONS)).default([]),
    colorable: z.boolean().default(true),
    defaultColor: hex.default('#3b4f44'),
    isStarter: z.boolean().default(false),
    universitySlug: slug.optional(), // omit = available everywhere
    price: z.number().int().min(0).default(0),
    description: z.string().trim().max(200).optional(),
  })
  .strict();

const wardrobeFileSchema = z
  .object({
    formatVersion: z.literal(1),
    settings: z
      .object({
        key: z.string().trim().min(1).max(60),
        palettes: z
          .object({
            skinTones: z.array(paletteEntry).min(1).max(30),
            hairColors: z.array(paletteEntry).min(1).max(30),
            fabricColors: z.array(hex).min(1).max(60),
          })
          .strict(),
        starterLook: slotsSchema,
        defaultOutfits: z
          .object(Object.fromEntries(OCCASIONS.map((el) => [el, slotsSchema])))
          .strict(),
      })
      .strict(),
    items: z.array(itemSchema).min(1).max(2000),
  })
  .strict();

/** Problems with a set of worn slots against the catalogue ([] = fine). */
export function slotProblems(slots, { itemsByKey, fabricColors, owned }, pathPrefix) {
  const problems = [];
  Object.entries(slots ?? {}).forEach(([slot, worn]) => {
    if (!worn) return;
    const path = `${pathPrefix}.${slot}`;
    const item = itemsByKey.get(worn.item);
    if (!item)
      return problems.push({ path: `${path}.item`, message: `Unknown item "${worn.item}"` });
    if (item.slot !== slot) {
      problems.push({
        path: `${path}.item`,
        message: `"${worn.item}" is a ${item.slot} item, not ${slot}`,
      });
    }
    if (owned && !owned.has(worn.item)) {
      problems.push({ path: `${path}.item`, message: `You don't own "${worn.item}" yet` });
    }
    if (worn.color && !item.colorable) {
      problems.push({ path: `${path}.color`, message: `"${worn.item}" can't be recoloured` });
    } else if (worn.color && !fabricColors.includes(worn.color)) {
      problems.push({ path: `${path}.color`, message: 'Choose a colour from the fabric palette' });
    }
  });
  if (slots?.fullbody && (slots.top || slots.bottom)) {
    problems.push({
      path: `${pathPrefix}.fullbody`,
      message: 'A full-body item replaces the top and bottom — remove them first',
    });
  }
  return problems;
}

/** Validate a wardrobe file (no database). */
export function validateWardrobe(raw) {
  const parsed = wardrobeFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((el) => ({
        path: el.path.join('.') || '(root)',
        message: el.message,
      })),
    };
  }
  const data = parsed.data;
  const errors = [];

  const seen = new Set();
  data.items.forEach((item, i) => {
    if (seen.has(item.key))
      errors.push({ path: `items.${i}.key`, message: `Duplicate item "${item.key}"` });
    seen.add(item.key);
  });

  const itemsByKey = new Map(data.items.map((el) => [el.key, el]));
  // everything in the starter look and default outfits must be a STARTER item,
  // so every new player owns what they're dressed in
  const starterKeys = new Set(data.items.filter((el) => el.isStarter).map((el) => el.key));
  const context = {
    itemsByKey,
    fabricColors: data.settings.palettes.fabricColors,
    owned: starterKeys,
  };

  errors.push(...slotProblems(data.settings.starterLook, context, 'settings.starterLook'));
  OCCASIONS.forEach((occasion) =>
    errors.push(
      ...slotProblems(
        data.settings.defaultOutfits[occasion],
        context,
        `settings.defaultOutfits.${occasion}`,
      ),
    ),
  );
  if (!data.items.some((el) => el.slot === 'hair' && el.isStarter)) {
    errors.push({ path: 'items', message: 'At least one starter hairstyle is required' });
  }

  return { valid: errors.length === 0, data, errors };
}

/** Validate then upsert items + settings. Returns { valid, errors, results? }. */
export async function importWardrobe(raw, { dryRun = false } = {}) {
  const report = validateWardrobe(raw);
  if (!report.valid) return report;

  // university-specific items: resolve slugs once
  const slugs = [...new Set(report.data.items.map((el) => el.universitySlug).filter(Boolean))];
  const universities = new Map(
    (await University.find({ slug: mongoose.trusted({ $in: slugs }) })).map((el) => [
      el.slug,
      el._id,
    ]),
  );
  report.data.items.forEach((item, i) => {
    if (item.universitySlug && !universities.has(item.universitySlug)) {
      report.errors.push({
        path: `items.${i}.universitySlug`,
        message: `Unknown university "${item.universitySlug}"`,
      });
    }
  });
  if (report.errors.length) return { ...report, valid: false };
  if (dryRun) return { ...report, dryRun: true };

  const results = { items: { created: 0, updated: 0, unchanged: 0 }, settings: 'saved' };
  /* eslint-disable no-await-in-loop -- small catalogue, readable sequential upserts */
  for (const { universitySlug, ...fields } of report.data.items) {
    const doc =
      (await ItemDefinition.findOne({ key: fields.key })) ??
      new ItemDefinition({ key: fields.key });
    const { key, ...rest } = fields;
    doc.set({ ...rest, university: universitySlug ? universities.get(universitySlug) : null });
    if (doc.isNew) results.items.created += 1;
    else if (doc.isModified()) results.items.updated += 1;
    else {
      results.items.unchanged += 1;
      continue;
    }
    await doc.save();
  }
  /* eslint-enable no-await-in-loop */

  const { key, ...settings } = report.data.settings;
  await WardrobeSettings.findOneAndUpdate(
    { key },
    { $set: settings },
    { upsert: true, setDefaultsOnInsert: true },
  );

  return { valid: true, errors: [], results };
}
