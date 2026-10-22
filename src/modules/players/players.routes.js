import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';
import Player, { PLAYER_GENDERS } from './player.model.js';

const updatePlayerSchema = z
  .object({
    displayName: z.string().trim().min(2).max(40).optional(),
    gender: z.enum(PLAYER_GENDERS).optional(),
    bio: z.string().trim().max(280).optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, { message: 'Nothing to update' });

// GET MY PLAYER PROFILE
const getMyPlayer = catchAsync(async (req, res, next) => {
  const player = await Player.findOne({ user: req.user._id });
  if (!player) return next(AppError.notFound('No player profile found.'));
  sendSuccess(res, { player });
});

// UPDATE MY PLAYER PROFILE — only these fields; never account fields
const updateMyPlayer = catchAsync(async (req, res, next) => {
  const player = await Player.findOne({ user: req.user._id });
  if (!player) return next(AppError.notFound('No player profile found.'));
  player.set(req.validated.body);
  await player.save();
  sendSuccess(res, { player });
});

// mounted at /api/v1/players
export function createPlayersRouter(env) {
  const router = express.Router();
  router.use(protect(env));
  router
    .route('/me')
    .get(getMyPlayer)
    .patch(validate({ body: updatePlayerSchema }), updateMyPlayer);
  return router;
}
