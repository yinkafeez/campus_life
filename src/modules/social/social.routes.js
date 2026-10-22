import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import { loadPlayer } from '../players/loadPlayer.js';
import { PRIVACY_AUDIENCES } from '../players/player.model.js';
import {
  acceptFriendRequest,
  addRelation,
  declineFriendRequest,
  listFriends,
  listRelations,
  publicProfile,
  removeFriend,
  removeRelation,
  searchPlayers,
  sendFriendRequest,
} from './social.service.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id');
const idParams = (name) => validate({ params: z.object({ [name]: objectId }).strict() });
const username = z.string().trim().toLowerCase().min(3).max(24);

const privacySchema = z
  .object({
    profileVisibility: z.enum(PRIVACY_AUDIENCES).optional(),
    messagesFrom: z.enum(PRIVACY_AUDIENCES).optional(),
    allowFriendRequests: z.boolean().optional(),
    showOnline: z.boolean().optional(),
    shareActivity: z.boolean().optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, { message: 'Nothing to update' });

// mounted at /api/v1/social — the signed-in player's social life
export function createSocialRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  // FRIENDS & REQUESTS
  router.get(
    '/friends',
    catchAsync(async (req, res) => sendSuccess(res, await listFriends(req.player))),
  );
  router.post(
    '/friend-requests',
    validate({ body: z.object({ username }).strict() }),
    catchAsync(async (req, res) => {
      const request = await sendFriendRequest(req.player, req.validated.body.username);
      sendSuccess(res, { request }, { statusCode: 201 });
    }),
  );
  router.post(
    '/friend-requests/:id/accept',
    idParams('id'),
    catchAsync(async (req, res) => {
      sendSuccess(res, { request: await acceptFriendRequest(req.player, req.validated.params.id) });
    }),
  );
  router.delete(
    '/friend-requests/:id',
    idParams('id'),
    catchAsync(async (req, res) => {
      await declineFriendRequest(req.player, req.validated.params.id);
      sendSuccess(res, null, { statusCode: 204 });
    }),
  );
  router.delete(
    '/friends/:playerId',
    idParams('playerId'),
    catchAsync(async (req, res) => {
      await removeFriend(req.player, req.validated.params.playerId);
      sendSuccess(res, null, { statusCode: 204 });
    }),
  );

  // PLAYERS
  router.get(
    '/players',
    validate({ query: z.object({ q: z.string().trim().max(24) }).strict() }),
    catchAsync(async (req, res) => {
      sendSuccess(res, { players: await searchPlayers(req.player, req.validated.query.q) });
    }),
  );
  router.get(
    '/players/:username',
    validate({ params: z.object({ username }).strict() }),
    catchAsync(async (req, res) => {
      sendSuccess(res, { profile: await publicProfile(req.player, req.validated.params.username) });
    }),
  );

  // SAFETY: BLOCKS & MUTES
  router.get(
    '/relations',
    catchAsync(async (req, res) => sendSuccess(res, await listRelations(req.player))),
  );
  ['block', 'mute'].forEach((type) => {
    router.post(
      `/${type}s`,
      validate({ body: z.object({ playerId: objectId }).strict() }),
      catchAsync(async (req, res) => {
        await addRelation(req.player, req.validated.body.playerId, type);
        sendSuccess(res, await listRelations(req.player), { statusCode: 201 });
      }),
    );
    router.delete(
      `/${type}s/:playerId`,
      idParams('playerId'),
      catchAsync(async (req, res) => {
        await removeRelation(req.player, req.validated.params.playerId, type);
        sendSuccess(res, null, { statusCode: 204 });
      }),
    );
  });

  // PRIVACY SETTINGS
  router.get('/privacy', (req, res) => sendSuccess(res, { privacy: req.player.privacy }));
  router.patch(
    '/privacy',
    validate({ body: privacySchema }),
    catchAsync(async (req, res) => {
      Object.entries(req.validated.body).forEach(([key, value]) =>
        req.player.set(`privacy.${key}`, value),
      );
      await req.player.save();
      sendSuccess(res, { privacy: req.player.privacy });
    }),
  );

  return router;
}
