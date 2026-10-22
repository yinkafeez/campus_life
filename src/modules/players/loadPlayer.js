import AppError from '../../core/errors/AppError.js';
import catchAsync from '../../core/http/catchAsync.js';
import Player from './player.model.js';

// after protect: put the signed-in user's player profile on req.player
export const loadPlayer = catchAsync(async (req, res, next) => {
  const player = await Player.findOne({ user: req.user._id });
  if (!player) return next(AppError.notFound('No player profile found.'));
  req.player = player;
  next();
});
