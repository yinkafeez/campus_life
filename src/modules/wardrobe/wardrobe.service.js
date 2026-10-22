import { z } from 'zod';
import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import ItemDefinition from './itemDefinition.model.js';
import WardrobeSettings from './wardrobeSettings.model.js';
import InventoryItem from './inventoryItem.model.js';
import Character from './character.model.js';
import StudentRecord from '../students/studentRecord.model.js';
import { slotProblems, slotsSchema } from './wardrobe.import.js';
import { BODY_TYPES, HEIGHT_RANGE, OCCASIONS } from './wardrobe.constants.js';

/*
 * WARDROBE & CHARACTER — every rule is checked on the server:
 * items must exist, fit the slot, be OWNED by the player, and use palette colours.
 */

export const appearanceSchema = z
  .object({
    bodyType: z.enum(BODY_TYPES),
    height: z.number().min(HEIGHT_RANGE.min).max(HEIGHT_RANGE.max),
    skinTone: z.string().trim().max(40),
    hairColor: z.string().trim().max(40),
    hairStyle: z.string().trim().max(80),
  })
  .strict();

export const lookSchema = z
  .object({ appearance: appearanceSchema, equipped: slotsSchema })
  .strict();
export { slotsSchema };

const notConfigured = () =>
  new AppError('The wardrobe is not set up on this server yet.', 503, 'WARDROBE_NOT_CONFIGURED');

/** The catalogue a player sees: global items + their university's items, plus settings. */
export async function loadCatalogue(playerId) {
  const record = playerId
    ? await StudentRecord.findOne({ player: playerId }).select('university')
    : null;
  const [items, settings] = await Promise.all([
    ItemDefinition.find({
      university: mongoose.trusted({ $in: [null, ...(record ? [record.university] : [])] }),
    })
      .select('-__v')
      .sort({ slot: 1, name: 1 }),
    WardrobeSettings.findOne({ key: 'global' }),
  ]);
  if (!settings || !items.length) throw notConfigured();
  return { items, settings, itemsByKey: new Map(items.map((el) => [el.key, el])) };
}

export async function ownedItemKeys(playerId) {
  return new Set(await InventoryItem.distinct('itemKey', { player: playerId }));
}

/** Field-level problems with a look (appearance + equipped), for this player. */
function lookProblems({ appearance, equipped }, { catalogue, owned }) {
  const { palettes } = catalogue.settings;
  const problems = [];
  if (appearance) {
    if (!palettes.skinTones.some((el) => el.key === appearance.skinTone)) {
      problems.push({
        path: 'appearance.skinTone',
        message: 'Choose a skin tone from the palette',
      });
    }
    if (!palettes.hairColors.some((el) => el.key === appearance.hairColor)) {
      problems.push({
        path: 'appearance.hairColor',
        message: 'Choose a hair colour from the palette',
      });
    }
    const hair = catalogue.itemsByKey.get(appearance.hairStyle);
    if (!hair || hair.slot !== 'hair') {
      problems.push({ path: 'appearance.hairStyle', message: 'Unknown hairstyle' });
    } else if (!owned.has(hair.key)) {
      problems.push({ path: 'appearance.hairStyle', message: "You don't own that hairstyle yet" });
    }
  }
  if (equipped) {
    problems.push(
      ...slotProblems(
        equipped,
        { itemsByKey: catalogue.itemsByKey, fabricColors: palettes.fabricColors, owned },
        'equipped',
      ),
    );
  }
  return problems;
}

const assertLook = (look, context) => {
  const problems = lookProblems(look, context);
  if (problems.length)
    throw AppError.validation(problems, 'Some of your choices are not available.');
};

export async function findCharacter(playerId) {
  return Character.findOne({ player: playerId });
}

/** Create the player's character: grants the starter kit, dresses them, fills default outfits. */
export async function createCharacter(player, look) {
  if (await Character.exists({ player: player._id })) {
    throw new AppError('You already have a character.', 409, 'CHARACTER_EXISTS');
  }
  const catalogue = await loadCatalogue(player._id);

  // 1) starter kit — idempotent (ordered:false ignores items already owned)
  const starter = catalogue.items.filter((el) => el.isStarter).map((el) => el.key);
  await InventoryItem.insertMany(
    starter.map((itemKey) => ({ player: player._id, itemKey, source: 'starter' })),
    { ordered: false },
  ).catch((err) => {
    if (err?.code !== 11000 && !err?.writeErrors) throw err;
  });

  // 2) the chosen look must only use owned items
  const owned = await ownedItemKeys(player._id);
  assertLook(look, { catalogue, owned });

  // 3) default outfits for every occasion (from the wardrobe settings)
  const outfits = OCCASIONS.map((occasion) => ({
    occasion,
    slots: catalogue.settings.defaultOutfits[occasion] ?? {},
  }));

  return Character.create({ player: player._id, ...look, outfits });
}

/** Change appearance and what's worn (both validated together). */
export async function updateLook(character, look) {
  const catalogue = await loadCatalogue(character.player);
  const owned = await ownedItemKeys(character.player);
  assertLook(look, { catalogue, owned });
  character.appearance = look.appearance;
  character.equipped = look.equipped;
  await character.save();
  return character;
}

/** Save slots (or what's worn right now) as the outfit for an occasion. */
export async function saveOutfit(character, occasion, slots) {
  const catalogue = await loadCatalogue(character.player);
  const owned = await ownedItemKeys(character.player);
  const chosen = slots ?? character.toObject().equipped ?? {};
  assertLook({ equipped: chosen }, { catalogue, owned });

  const outfits = character.outfits.filter((el) => el.occasion !== occasion);
  outfits.push({ occasion, slots: chosen, updatedAt: new Date() });
  character.outfits = outfits;
  await character.save();
  return character;
}

/** Put on the saved outfit for an occasion (items are re-checked: they must still be owned). */
export async function wearOutfit(character, occasion) {
  const outfit = character.outfits.find((el) => el.occasion === occasion);
  if (!outfit) throw AppError.notFound('No outfit saved for that occasion.');
  const slots = outfit.toObject().slots ?? {};
  const catalogue = await loadCatalogue(character.player);
  const owned = await ownedItemKeys(character.player);
  assertLook({ equipped: slots }, { catalogue, owned });
  character.equipped = slots;
  await character.save();
  return character;
}

/** Remember where the player stands (resume point). */
export async function savePosition(character, position) {
  character.lastPosition = { ...position, savedAt: new Date() };
  await character.save();
  return character;
}
