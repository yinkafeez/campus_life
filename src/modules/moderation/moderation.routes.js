import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import { loadPlayer } from '../players/loadPlayer.js';
import {
  MODERATION_ACTIONS,
  REPORT_CONTEXTS,
  REPORT_REASONS,
  REPORT_STATUSES,
} from './report.model.js';
import {
  createReport,
  liftSanctions,
  listReports,
  moderationHistory,
  resolveReport,
} from './moderation.service.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id');

// mounted at /api/v1/reports — players report abuse
export function createReportsRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  router.post(
    '/',
    validate({
      body: z
        .object({
          targetId: objectId,
          context: z.enum(REPORT_CONTEXTS),
          reason: z.enum(REPORT_REASONS),
          details: z.string().trim().max(1000).optional(),
          messageId: objectId.optional(),
          chatId: z.string().uuid().optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) => {
      const report = await createReport(req.player, req.validated.body);
      // the reporter only learns that it was received
      sendSuccess(
        res,
        { report: { id: report._id, status: report.status, createdAt: report.createdAt } },
        { statusCode: 201 },
      );
    }),
  );

  return router;
}

// mounted under /api/v1/admin (the admin gate runs first — see app.js)
export const moderationAdminRouter = express.Router();

moderationAdminRouter.get(
  '/reports',
  validate({
    query: z
      .object({
        status: z.enum(REPORT_STATUSES).default('open'),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .strict(),
  }),
  catchAsync(async (req, res) => {
    sendSuccess(res, { reports: await listReports(req.validated.query) });
  }),
);

moderationAdminRouter.patch(
  '/reports/:id',
  validate({
    params: z.object({ id: objectId }).strict(),
    body: z
      .object({
        action: z.enum(MODERATION_ACTIONS),
        durationHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 365)
          .optional(),
        note: z.string().trim().max(1000).optional(),
      })
      .strict()
      .refine((val) => !['mute-chat', 'suspend'].includes(val.action) || val.durationHours, {
        message: 'mute-chat and suspend need durationHours',
        path: ['durationHours'],
      }),
  }),
  catchAsync(async (req, res) => {
    const report = await resolveReport(req.validated.params.id, req.validated.body, req.adminActor);
    req.log.info({ report: report._id, action: report.resolution.action }, 'Report resolved');
    sendSuccess(res, { report });
  }),
);

// a player's record + sanctions; lifting a mute / suspension early
moderationAdminRouter.get(
  '/players/:id/moderation',
  validate({ params: z.object({ id: objectId }).strict() }),
  catchAsync(async (req, res) =>
    sendSuccess(res, { history: await moderationHistory(req.validated.params.id) }),
  ),
);
moderationAdminRouter.post(
  '/players/:id/sanctions/lift',
  validate({
    params: z.object({ id: objectId }).strict(),
    body: z.object({ note: z.string().trim().min(3).max(500) }).strict(),
  }),
  catchAsync(async (req, res) => {
    const result = await liftSanctions(req.validated.params.id, req.validated.body, req.adminActor);
    req.log.info({ player: req.validated.params.id }, 'Sanctions lifted');
    sendSuccess(res, result);
  }),
);
