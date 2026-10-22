import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import { loadPlayer } from '../players/loadPlayer.js';
import { MAX_MESSAGE_LENGTH } from '../moderation/textFilter.js';
import {
  listConversations,
  listMessages,
  markRead,
  openDirect,
  openGroup,
  presentMessage,
  sendMessage,
} from './messaging.service.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id');
const conversationParams = validate({ params: z.object({ id: objectId }).strict() });

// mounted at /api/v1/messages
export function createMessagingRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  // MY INBOX
  router.get(
    '/conversations',
    catchAsync(async (req, res) => {
      sendSuccess(res, { conversations: await listConversations(req.player) });
    }),
  );

  // OPEN A DIRECT THREAD with another player (privacy + blocks are checked)
  router.post(
    '/conversations/direct',
    validate({ body: z.object({ playerId: objectId }).strict() }),
    catchAsync(async (req, res) => {
      const conversation = await openDirect(req.player, req.validated.body.playerId);
      sendSuccess(res, { conversation: { id: conversation._id, type: conversation.type } });
    }),
  );

  // OPEN A GROUP'S CHAT (members only)
  router.post(
    '/conversations/group',
    validate({ body: z.object({ groupId: objectId }).strict() }),
    catchAsync(async (req, res) => {
      const conversation = await openGroup(req.player, req.validated.body.groupId);
      sendSuccess(res, { conversation: { id: conversation._id, type: conversation.type } });
    }),
  );

  router.get(
    '/conversations/:id/messages',
    validate({
      params: z.object({ id: objectId }).strict(),
      query: z
        .object({
          before: objectId.optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) => {
      sendSuccess(
        res,
        await listMessages(req.player, req.validated.params.id, req.validated.query),
      );
    }),
  );

  router.post(
    '/conversations/:id/messages',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ text: z.string().min(1).max(MAX_MESSAGE_LENGTH) }).strict(),
    }),
    catchAsync(async (req, res) => {
      const message = await sendMessage(
        req.player,
        req.validated.params.id,
        req.validated.body.text,
      );
      sendSuccess(res, { message: presentMessage(message) }, { statusCode: 201 });
    }),
  );

  router.post(
    '/conversations/:id/read',
    conversationParams,
    catchAsync(async (req, res) => {
      await markRead(req.player, req.validated.params.id);
      sendSuccess(res, null, { statusCode: 204 });
    }),
  );

  return router;
}
