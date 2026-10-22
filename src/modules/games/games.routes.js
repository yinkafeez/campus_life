import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';
import { loadPlayer } from '../players/loadPlayer.js';
import { GAME_TYPE_KEYS } from './types/index.js';
import {
  createChallenge,
  enterCompetition,
  getCompetition,
  getSession,
  leaderboard,
  listChallenges,
  listCompetitions,
  listGameAchievements,
  listGames,
  playChallenge,
  playCompetition,
  respondToChallenge,
  startSolo,
  submitSession,
} from './games.service.js';
import { importGamesPack } from './games.import.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id');
const idParams = validate({ params: z.object({ id: objectId }).strict() });
const gameType = z.enum(GAME_TYPE_KEYS);

// mounted at /api/v1/games — mini-games, duels, leaderboards and campus competitions
export function createGamesRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  router.get(
    '/',
    catchAsync(async (req, res) => sendSuccess(res, { games: await listGames(req.player) })),
  );

  // SOLO PLAY + SESSIONS
  router.post(
    '/sessions',
    validate({ body: z.object({ type: gameType }).strict() }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await startSolo(req.player, req.validated.body.type), { statusCode: 201 }),
    ),
  );
  router.get(
    '/sessions/:id',
    idParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, await getSession(req.player, req.validated.params.id)),
    ),
  );
  router.post(
    '/sessions/:id/submit',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ answer: z.unknown() }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        await submitSession(req.player, req.validated.params.id, req.validated.body.answer),
      ),
    ),
  );

  // DUELS (invite a friend, or quick-match)
  router.get(
    '/challenges',
    catchAsync(async (req, res) =>
      sendSuccess(res, { challenges: await listChallenges(req.player) }),
    ),
  );
  router.post(
    '/challenges',
    validate({ body: z.object({ type: gameType, opponentId: objectId.optional() }).strict() }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await createChallenge(req.player, req.validated.body), { statusCode: 201 }),
    ),
  );
  ['accept', 'decline'].forEach((answer) =>
    router.post(
      `/challenges/:id/${answer}`,
      idParams,
      catchAsync(async (req, res) =>
        sendSuccess(res, {
          challenge: await respondToChallenge(
            req.player,
            req.validated.params.id,
            answer === 'accept',
          ),
        }),
      ),
    ),
  );
  router.post(
    '/challenges/:id/play',
    idParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, await playChallenge(req.player, req.validated.params.id)),
    ),
  );

  // LEADERBOARDS & ACHIEVEMENTS
  router.get(
    '/leaderboards/:type',
    validate({
      params: z.object({ type: gameType }).strict(),
      query: z.object({ metric: z.enum(['best', 'rating', 'wins']).default('best') }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(res, {
        leaderboard: await leaderboard(
          req.player,
          req.validated.params.type,
          req.validated.query.metric,
        ),
      }),
    ),
  );
  router.get(
    '/achievements',
    catchAsync(async (req, res) =>
      sendSuccess(res, { achievements: await listGameAchievements(req.player) }),
    ),
  );

  // COMPETITIONS (scheduled campus events)
  router.get(
    '/competitions',
    catchAsync(async (req, res) =>
      sendSuccess(res, { competitions: await listCompetitions(req.player) }),
    ),
  );
  router.get(
    '/competitions/:id',
    idParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, { competition: await getCompetition(req.player, req.validated.params.id) }),
    ),
  );
  router.post(
    '/competitions/:id/entries',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ groupId: objectId.optional() }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        {
          competition: await enterCompetition(
            req.player,
            req.validated.params.id,
            req.validated.body,
          ),
        },
        { statusCode: 201 },
      ),
    ),
  );
  router.post(
    '/competitions/:id/play',
    idParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, await playCompetition(req.player, req.validated.params.id), {
        statusCode: 201,
      }),
    ),
  );

  return router;
}

// mounted under /api/v1/admin
export const gamesAdminRouter = express.Router();
gamesAdminRouter.post(
  '/games-packs/import',
  validate({
    query: z
      .object({
        dryRun: z
          .enum(['true', 'false'])
          .default('false')
          .transform((v) => v === 'true'),
      })
      .strict(),
    body: z.object({}).passthrough(),
  }),
  catchAsync(async (req, res, next) => {
    const report = await importGamesPack(req.body, { dryRun: req.validated.query.dryRun });
    if (!report.valid)
      return next(
        new AppError(
          `The pack has ${report.errors.length} problem(s).`,
          422,
          'PACK_INVALID',
          report.errors,
        ),
      );
    sendSuccess(res, { report }, { statusCode: report.dryRun ? 200 : 201 });
  }),
);
