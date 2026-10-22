import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import { loadPlayer } from '../players/loadPlayer.js';
import {
  advanceLevel,
  getActivity,
  getStanding,
  listAchievements,
  listActivities,
  listMissions,
  recentAttempts,
  startAttempt,
  submitAttempt,
} from './learning.service.js';
import { importPack } from './pack/importPack.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id');
const keyParams = validate({
  params: z.object({ key: z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN) }).strict(),
});

// mounted at /api/v1/learning — the signed-in student's (simulated) studies
export function createLearningRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  router.get(
    '/standing',
    catchAsync(async (req, res) => sendSuccess(res, { standing: await getStanding(req.player) })),
  );
  router.post(
    '/progression/advance',
    catchAsync(async (req, res) => sendSuccess(res, { promotion: await advanceLevel(req.player) })),
  );

  router.get(
    '/activities',
    catchAsync(async (req, res) =>
      sendSuccess(res, { activities: await listActivities(req.player) }),
    ),
  );
  router.get(
    '/activities/:key',
    keyParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, await getActivity(req.player, req.validated.params.key)),
    ),
  );
  router.post(
    '/activities/:key/attempts',
    keyParams,
    catchAsync(async (req, res) => {
      const started = await startAttempt(req.player, req.validated.params.key);
      sendSuccess(res, started, { statusCode: started.resumed ? 200 : 201 });
    }),
  );

  router.get(
    '/attempts',
    validate({
      query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(res, { attempts: await recentAttempts(req.player, req.validated.query.limit) }),
    ),
  );
  router.post(
    '/attempts/:id/submit',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ answer: z.unknown() }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        await submitAttempt(req.player, req.validated.params.id, req.validated.body.answer),
      ),
    ),
  );

  router.get(
    '/missions',
    catchAsync(async (req, res) => sendSuccess(res, { missions: await listMissions(req.player) })),
  );
  router.get(
    '/achievements',
    catchAsync(async (req, res) =>
      sendSuccess(res, { achievements: await listAchievements(req.player) }),
    ),
  );

  return router;
}

// mounted under /api/v1/admin — import learning packs (new activities without a code change)
export const learningAdminRouter = express.Router();
const dryRunQuery = z
  .object({
    dryRun: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .strict();

learningAdminRouter.post(
  '/learning-packs/import',
  validate({ query: dryRunQuery, body: z.object({}).passthrough() }),
  catchAsync(async (req, res, next) => {
    const { dryRun } = req.validated.query;
    const report = await importPack(req.body, { dryRun });
    if (!report.valid) {
      return next(
        new AppError(
          `The pack has ${report.errors.length} problem(s). Nothing was imported.`,
          422,
          'PACK_INVALID',
          report.errors,
        ),
      );
    }
    req.log.info(
      { university: report.summary.university, dryRun, results: report.results },
      'Learning pack imported',
    );
    sendSuccess(res, { report }, { statusCode: dryRun ? 200 : 201 });
  }),
);
