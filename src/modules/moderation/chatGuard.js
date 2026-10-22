import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import Player from '../players/player.model.js';
import { createRateLimiter, filterText } from './textFilter.js';

// one shared budget for everything a player "says" (zone chat + messages): 8 lines / 10 s
const allowMessage = createRateLimiter({ limit: 8, windowMs: 10_000 });

/** Throws when a moderator has muted this player's chat. */
export async function assertNotChatMuted(playerId) {
  const muted = await Player.exists({
    _id: playerId,
    chatMutedUntil: mongoose.trusted({ $gt: new Date() }),
  });
  if (muted) throw new AppError('A moderator has paused your chat for now.', 403, 'CHAT_MUTED');
}

/**
 * Everything a player sends goes through here: moderator mute → rate limit → text filter.
 * Returns the cleaned { text, masked }.
 */
export async function guardChat(playerId, raw, { isPublic = false } = {}) {
  await assertNotChatMuted(playerId);
  if (!allowMessage(String(playerId))) {
    throw new AppError(
      'You are sending messages too fast. Take a breath.',
      429,
      'CHAT_RATE_LIMITED',
    );
  }
  const result = filterText(raw, { isPublic });
  if (!result.text) throw AppError.badRequest('Message is empty.');
  return result;
}
