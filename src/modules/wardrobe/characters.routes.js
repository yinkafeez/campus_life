import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import Player from '../players/player.model.js';
import InventoryItem from './inventoryItem.model.js';
import { BODY_TYPES, HEIGHT_RANGE, OCCASIONS } from './wardrobe.constants.js';
import {
  createCharacter,
  findCharacter,
  loadCatalogue,
  lookSchema,
  saveOutfit,
  savePosition,
  slotsSchema,
  updateLook,
  wearOutfit,
} from './wardrobe.service.js';

const occasionParams = z.object({ occasion: z.enum(OCCASIONS) }).strict();
const saveOutfitSchema = z
  .object({
    // omit "slots" to save what the character is wearing right now
    slots: slotsSchema.optional(),
  })
  .strict();
const positionSchema = z
  .object({
    zone: z.string().trim().max(60).regex(SLUG_PATTERN),
    x: z.number().finite().min(-10_000).max(10_000),
    z: z.number().finite().min(-10_000).max(10_000),
    rotY: z.number().finite().min(-100).max(100),
  })
  .strict();

const loadPlayer = catchAsync(async (req, res, next) => {
  const player = await Player.findOne({ user: req.user._id });
  if (!player) return next(AppError.notFound('No player profile found.'));
  req.player = player;
  next();
});

const requireCharacter = catchAsync(async (req, res, next) => {
  const character = await findCharacter(req.player._id);
  if (!character) {
    return next(new AppError("You haven't created your character yet.", 404, 'NO_CHARACTER'));
  }
  req.character = character;
  next();
});

const sendCharacter = (res, character, statusCode = 200) =>
  sendSuccess(res, { character }, { statusCode });

// GET THE WARDROBE — catalogue, palettes, occasions, and which items I own
const getWardrobe = catchAsync(async (req, res) => {
  const { items, settings } = await loadCatalogue(req.player._id);
  const owned = await InventoryItem.find({ player: req.player._id }).select(
    'itemKey source acquiredAt',
  );
  sendSuccess(res, {
    items,
    owned,
    palettes: settings.palettes,
    occasions: OCCASIONS,
    bodyTypes: BODY_TYPES,
    heightRange: HEIGHT_RANGE,
    starterLook: settings.starterLook,
  });
});

// mounted at /api/v1/characters — the signed-in player's own character only
export function createCharactersRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  router.post(
    '/me',
    validate({ body: lookSchema }),
    catchAsync(async (req, res) => {
      const character = await createCharacter(req.player, req.validated.body);
      req.log.info({ player: req.player.id }, 'Character created');
      sendCharacter(res, character, 201);
    }),
  );

  router.use('/me', requireCharacter);
  router.get('/me', (req, res) => sendCharacter(res, req.character));

  router.put(
    '/me/look',
    validate({ body: lookSchema }),
    catchAsync(async (req, res) => {
      sendCharacter(res, await updateLook(req.character, req.validated.body));
    }),
  );

  router.put(
    '/me/outfits/:occasion',
    validate({ params: occasionParams, body: saveOutfitSchema }),
    catchAsync(async (req, res) => {
      const { occasion } = req.validated.params;
      sendCharacter(res, await saveOutfit(req.character, occasion, req.validated.body.slots));
    }),
  );

  router.post(
    '/me/outfits/:occasion/wear',
    validate({ params: occasionParams }),
    catchAsync(async (req, res) => {
      sendCharacter(res, await wearOutfit(req.character, req.validated.params.occasion));
    }),
  );

  router.patch(
    '/me/position',
    validate({ body: positionSchema }),
    catchAsync(async (req, res) => {
      sendCharacter(res, await savePosition(req.character, req.validated.body));
    }),
  );

  return router;
}

// mounted at /api/v1/wardrobe
export function createWardrobeRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);
  router.get('/', getWardrobe);
  return router;
}
