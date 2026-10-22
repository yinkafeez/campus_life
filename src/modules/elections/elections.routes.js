import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import { resolveUniversity } from '../../core/middleware/tenant.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import { loadPlayer } from '../players/loadPlayer.js';
import { CAMPAIGN_KINDS } from './elections.models.js';
import {
  addCampaignItem,
  adminCertify,
  auditLog,
  cancelElection,
  castVote,
  disqualify,
  fileDispute,
  getElection,
  listElections,
  nominate,
  publicAuditLog,
  openCycle,
  removeLeader,
  removeSupport,
  resolveDispute,
  support,
  updateManifesto,
  verifyBallot,
  withdraw,
} from './elections.service.js';
import {
  announce,
  currentLeaders,
  myAnnouncements,
  myOffices,
  officeActions,
  officialEvent,
  welfareGrant,
} from './leadership.service.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id');
const idParams = validate({ params: z.object({ id: objectId }).strict() });
const text = (max) => z.string().trim().min(1).max(max);
const manifesto = z
  .object({
    summary: z.string().trim().max(600).optional(),
    points: z.array(text(160)).max(8).default([]),
  })
  .strict();
const poster = z
  .object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    layout: z.enum(['bold', 'classic', 'minimal']),
  })
  .strict();
const requestKey = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

// mounted at /api/v1/elections — student elections and leadership (game)
export function createElectionsRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  router.get(
    '/',
    catchAsync(async (req, res) =>
      sendSuccess(res, { elections: await listElections(req.player) }),
    ),
  );

  // LEADERSHIP (my offices, my leaders, announcements) — before /:id
  router.get(
    '/offices/me',
    catchAsync(async (req, res) => sendSuccess(res, { offices: await myOffices(req.player) })),
  );
  router.get(
    '/leaders',
    catchAsync(async (req, res) => sendSuccess(res, { leaders: await currentLeaders(req.player) })),
  );
  router.get(
    '/announcements',
    catchAsync(async (req, res) =>
      sendSuccess(res, { announcements: await myAnnouncements(req.player) }),
    ),
  );
  router.post(
    '/offices/:id/announcements',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ title: text(120), body: text(1500) }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        { announcement: await announce(req.player, req.validated.params.id, req.validated.body) },
        { statusCode: 201 },
      ),
    ),
  );
  router.post(
    '/offices/:id/events',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z
        .object({
          title: text(80),
          description: z.string().trim().max(500).optional(),
          locationSlug: z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN),
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
          capacity: z.number().int().min(2).max(500).optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        { event: await officialEvent(req.player, req.validated.params.id, req.validated.body) },
        { statusCode: 201 },
      ),
    ),
  );
  router.post(
    '/offices/:id/welfare-grants',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z
        .object({
          recipientId: objectId,
          amount: z.number().int().min(1).max(10_000),
          reason: text(200),
          requestKey,
        })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        { grant: await welfareGrant(req.player, req.validated.params.id, req.validated.body) },
        { statusCode: 201 },
      ),
    ),
  );

  // ONE ELECTION
  router.get(
    '/:id',
    idParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, await getElection(req.player, req.validated.params.id)),
    ),
  );
  router.get(
    '/:id/audit',
    idParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, { audit: await publicAuditLog(req.player, req.validated.params.id) }),
    ),
  );

  router.post(
    '/:id/candidacy',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z
        .object({
          slogan: z.string().trim().max(80).optional(),
          manifesto,
          poster: poster.optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        { candidacy: await nominate(req.player, req.validated.params.id, req.validated.body) },
        { statusCode: 201 },
      ),
    ),
  );
  router.patch(
    '/:id/candidacy',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z
        .object({
          slogan: z.string().trim().max(80).optional(),
          manifesto: manifesto.optional(),
          poster: poster.optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(res, {
        candidacy: await updateManifesto(req.player, req.validated.params.id, req.validated.body),
      }),
    ),
  );
  router.delete(
    '/:id/candidacy',
    idParams,
    catchAsync(async (req, res) => {
      await withdraw(req.player, req.validated.params.id);
      sendSuccess(res, null, { statusCode: 204 });
    }),
  );
  router.post(
    '/:id/campaign',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z
        .object({
          kind: z.enum(CAMPAIGN_KINDS),
          title: z.string().trim().max(120).optional(),
          body: text(1500),
          question: z.number().int().min(0).max(20).optional(),
          location: z.string().trim().max(80).optional(),
          startsAt: z.iso.datetime({ offset: true }).optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        { item: await addCampaignItem(req.player, req.validated.params.id, req.validated.body) },
        { statusCode: 201 },
      ),
    ),
  );
  router.post(
    '/:id/support',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ candidacyId: objectId, kind: z.enum(['endorse', 'volunteer']) }).strict(),
    }),
    catchAsync(async (req, res) => {
      await support(req.player, req.validated.params.id, req.validated.body);
      sendSuccess(res, null, { statusCode: 204 });
    }),
  );
  router.delete(
    '/:id/support/:kind',
    validate({
      params: z.object({ id: objectId, kind: z.enum(['endorse', 'volunteer']) }).strict(),
    }),
    catchAsync(async (req, res) => {
      await removeSupport(req.player, req.validated.params.id, req.validated.params.kind);
      sendSuccess(res, null, { statusCode: 204 });
    }),
  );

  // VOTING
  router.post(
    '/:id/ballots',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ candidacyIds: z.array(objectId).min(1).max(100) }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        await castVote(req.player, req.validated.params.id, req.validated.body.candidacyIds),
        { statusCode: 201 },
      ),
    ),
  );
  router.post(
    '/:id/ballots/verify',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ code: z.string().regex(/^[0-9a-f]{32}$/) }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        await verifyBallot(req.player, req.validated.params.id, req.validated.body.code),
      ),
    ),
  );
  router.post(
    '/:id/disputes',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ reason: text(1000) }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        {
          dispute: await fileDispute(
            req.player,
            req.validated.params.id,
            req.validated.body.reason,
          ),
        },
        { statusCode: 201 },
      ),
    ),
  );

  return router;
}

// mounted under /api/v1/admin — running elections (the admin gate runs first)
export const electionsAdminRouter = express.Router();
const reason = z.object({ reason: text(500) }).strict();

electionsAdminRouter.post(
  '/universities/:universitySlug/election-cycles',
  resolveUniversity({ includeDrafts: true }),
  validate({
    body: z
      .object({
        cycle: z.string().trim().max(60).optional(),
        startsAt: z.iso.datetime({ offset: true }).optional(),
        positionCodes: z.array(z.string().trim().toUpperCase().max(10)).max(100).optional(),
      })
      .strict(),
  }),
  catchAsync(async (req, res) =>
    sendSuccess(
      res,
      { cycle: await openCycle(req.university, req.validated.body, req.adminActor) },
      { statusCode: 201 },
    ),
  ),
);
electionsAdminRouter.post(
  '/elections/:id/cancel',
  validate({ params: z.object({ id: objectId }).strict(), body: reason }),
  catchAsync(async (req, res) =>
    sendSuccess(res, {
      election: await cancelElection(
        req.validated.params.id,
        req.validated.body.reason,
        req.adminActor,
      ),
    }),
  ),
);
electionsAdminRouter.post(
  '/elections/:id/candidates/:candidacyId/disqualify',
  validate({ params: z.object({ id: objectId, candidacyId: objectId }).strict(), body: reason }),
  catchAsync(async (req, res) =>
    sendSuccess(res, {
      candidacy: await disqualify(
        req.validated.params.id,
        req.validated.params.candidacyId,
        req.validated.body.reason,
        req.adminActor,
      ),
    }),
  ),
);
electionsAdminRouter.post(
  '/elections/:id/certify',
  idParams,
  catchAsync(async (req, res) =>
    sendSuccess(res, { election: await adminCertify(req.validated.params.id, req.adminActor) }),
  ),
);
electionsAdminRouter.patch(
  '/election-disputes/:id',
  validate({
    params: z.object({ id: objectId }).strict(),
    body: z.object({ decision: z.enum(['upheld', 'rejected']), note: text(500) }).strict(),
  }),
  catchAsync(async (req, res) =>
    sendSuccess(res, {
      dispute: await resolveDispute(req.validated.params.id, req.validated.body, req.adminActor),
    }),
  ),
);
electionsAdminRouter.get(
  '/elections/:id/audit',
  idParams,
  catchAsync(async (req, res) =>
    sendSuccess(res, { audit: await auditLog(req.validated.params.id) }),
  ),
);
electionsAdminRouter.post(
  '/leadership-offices/:id/remove',
  validate({ params: z.object({ id: objectId }).strict(), body: reason }),
  catchAsync(async (req, res) =>
    sendSuccess(res, {
      office: await removeLeader(
        req.validated.params.id,
        req.validated.body.reason,
        req.adminActor,
      ),
    }),
  ),
);
electionsAdminRouter.get(
  '/leadership-offices/:id/actions',
  idParams,
  catchAsync(async (req, res) =>
    sendSuccess(res, { actions: await officeActions(req.validated.params.id) }),
  ),
);
