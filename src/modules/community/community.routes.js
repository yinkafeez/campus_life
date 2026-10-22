import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import { loadPlayer } from '../players/loadPlayer.js';
import {
  EVENT_KINDS,
  EVENT_VISIBILITY,
  GROUP_KINDS,
  GROUP_VISIBILITY,
} from './community.models.js';
import {
  cancelEvent,
  createEvent,
  createGroup,
  invite,
  joinGroup,
  leaveGroup,
  listEvents,
  listGroups,
  listInvitations,
  respondToInvitation,
  rsvp,
} from './community.service.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id');
const idParams = validate({ params: z.object({ id: objectId }).strict() });
const noContent = (res) => sendSuccess(res, null, { statusCode: 204 });

// mounted at /api/v1/community — groups, hangouts/events and invitations
export function createCommunityRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  // GROUPS
  router.get(
    '/groups',
    catchAsync(async (req, res) => sendSuccess(res, { groups: await listGroups(req.player) })),
  );
  router.post(
    '/groups',
    validate({
      body: z
        .object({
          name: z.string().trim().min(3).max(60),
          description: z.string().trim().max(500).optional(),
          kind: z.enum(GROUP_KINDS).default('other'),
          visibility: z.enum(GROUP_VISIBILITY).default('public'),
        })
        .strict(),
    }),
    catchAsync(async (req, res) => {
      sendSuccess(
        res,
        { group: await createGroup(req.player, req.validated.body) },
        { statusCode: 201 },
      );
    }),
  );
  router.post(
    '/groups/:id/members',
    idParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, { group: await joinGroup(req.player, req.validated.params.id) }),
    ),
  );
  router.delete(
    '/groups/:id/members/me',
    idParams,
    catchAsync(async (req, res) => {
      await leaveGroup(req.player, req.validated.params.id);
      noContent(res);
    }),
  );

  // EVENTS / HANGOUTS
  router.get(
    '/events',
    catchAsync(async (req, res) => sendSuccess(res, { events: await listEvents(req.player) })),
  );
  router.post(
    '/events',
    validate({
      body: z
        .object({
          title: z.string().trim().min(3).max(80),
          description: z.string().trim().max(500).optional(),
          kind: z.enum(EVENT_KINDS).default('hangout'),
          locationSlug: z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN),
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
          visibility: z.enum(EVENT_VISIBILITY).default('public'),
          capacity: z.number().int().min(2).max(500).default(50),
          groupId: objectId.optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) => {
      sendSuccess(
        res,
        { event: await createEvent(req.player, req.validated.body) },
        { statusCode: 201 },
      );
    }),
  );
  router.delete(
    '/events/:id',
    idParams,
    catchAsync(async (req, res) => {
      await cancelEvent(req.player, req.validated.params.id);
      noContent(res);
    }),
  );
  router.post(
    '/events/:id/rsvp',
    idParams,
    catchAsync(async (req, res) => {
      await rsvp(req.player, req.validated.params.id, true);
      noContent(res);
    }),
  );
  router.delete(
    '/events/:id/rsvp',
    idParams,
    catchAsync(async (req, res) => {
      await rsvp(req.player, req.validated.params.id, false);
      noContent(res);
    }),
  );

  // INVITATIONS
  router.get(
    '/invitations',
    catchAsync(async (req, res) =>
      sendSuccess(res, { invitations: await listInvitations(req.player) }),
    ),
  );
  router.post(
    '/invitations',
    validate({
      body: z
        .object({
          toPlayerId: objectId,
          groupId: objectId.optional(),
          eventId: objectId.optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) => {
      const invitation = await invite(req.player, req.validated.body);
      sendSuccess(
        res,
        { invitation: { id: invitation._id, kind: invitation.kind } },
        { statusCode: 201 },
      );
    }),
  );
  ['accept', 'decline'].forEach((answer) => {
    router.post(
      `/invitations/:id/${answer}`,
      idParams,
      catchAsync(async (req, res) => {
        const invitation = await respondToInvitation(
          req.player,
          req.validated.params.id,
          answer === 'accept',
        );
        sendSuccess(res, { invitation: { id: invitation._id, status: invitation.status } });
      }),
    );
  });

  return router;
}
