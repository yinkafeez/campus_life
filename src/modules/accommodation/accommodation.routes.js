import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import { resolveUniversity } from '../../core/middleware/tenant.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import { loadPlayer } from '../players/loadPlayer.js';
import {
  drawBallot,
  listHostelsFor,
  myAccommodation,
  requestBed,
  vacate,
} from './accommodation.service.js';

const slug = z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN);

// mounted at /api/v1/accommodation — the signed-in player's (simulated) hostel life
export function createAccommodationRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  router.get(
    '/hostels',
    catchAsync(async (req, res) => sendSuccess(res, await listHostelsFor(req.player))),
  );
  router.get(
    '/me',
    catchAsync(async (req, res) => sendSuccess(res, await myAccommodation(req.player))),
  );

  // book a bed (direct halls) or apply for the ballot
  router.post(
    '/me',
    validate({ body: z.object({ hostelSlug: slug }).strict() }),
    catchAsync(async (req, res) => {
      const assignment = await requestBed(req.player, req.validated.body.hostelSlug);
      sendSuccess(res, await myAccommodation(req.player), {
        statusCode: assignment.status === 'active' ? 201 : 202,
      });
    }),
  );

  router.delete(
    '/me',
    catchAsync(async (req, res) => {
      await vacate(req.player);
      sendSuccess(res, null, { statusCode: 204 });
    }),
  );

  return router;
}

// mounted under /api/v1/admin — run a hostel's ballot draw
export const accommodationAdminRouter = express.Router();

accommodationAdminRouter.post(
  '/universities/:universitySlug/hostels/:hostelSlug/ballot',
  resolveUniversity({ includeDrafts: true }),
  validate({ params: z.object({ universitySlug: slug, hostelSlug: slug }).strict() }),
  catchAsync(async (req, res) => {
    const result = await drawBallot(req.university, req.validated.params.hostelSlug);
    req.log.info({ hostel: req.validated.params.hostelSlug, ...result }, 'Hostel ballot drawn');
    sendSuccess(res, { result });
  }),
);
