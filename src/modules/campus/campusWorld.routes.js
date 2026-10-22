import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import { loadPlayer } from '../players/loadPlayer.js';
import { discoverLocation, doActivity, getCampusWorld } from './campus.service.js';

const slug = z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN);

// mounted at /api/v1/campus — the signed-in player's campus world
export function createCampusWorldRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  // GET MY CAMPUS — locations (with world placement), NPCs, my discoveries
  router.get(
    '/world',
    catchAsync(async (req, res) => {
      sendSuccess(res, await getCampusWorld(req.player));
    }),
  );

  // DISCOVER A LOCATION (the client calls this when the player walks into its radius)
  router.post(
    '/discoveries',
    validate({ body: z.object({ locationSlug: slug }).strict() }),
    catchAsync(async (req, res) => {
      const { discovery, isNew } = await discoverLocation(
        req.player,
        req.validated.body.locationSlug,
      );
      sendSuccess(res, { discovery, isNew }, { statusCode: isNew ? 201 : 200 });
    }),
  );

  // DO AN ACTIVITY AT A LOCATION
  router.post(
    '/activities',
    validate({ body: z.object({ locationSlug: slug, activityKey: slug }).strict() }),
    catchAsync(async (req, res) => {
      const { locationSlug, activityKey } = req.validated.body;
      sendSuccess(res, await doActivity(req.player, locationSlug, activityKey));
    }),
  );

  return router;
}
