import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';
import { SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import { loadPlayer } from '../players/loadPlayer.js';
import Player from '../players/player.model.js';
import { LEDGER_KINDS } from './economy.models.js';
import { auditWallet, post } from './ledger.js';
import {
  budgetSummary,
  claimAllowance,
  getWallet,
  giftItem,
  history,
  listBills,
  listInventory,
  listShop,
  moveSavings,
  payBill,
  purchase,
  setPlan,
  useItem,
} from './economy.service.js';
import {
  abandonJob,
  acceptJob,
  completeJob,
  getJob,
  listHustles,
  recentJobs,
} from './hustles.service.js';
import { importEconomy } from './economy.import.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'must be an id');
const key = z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN);
// a client-generated id for this request, so retries are never charged twice
const requestKey = z
  .string()
  .trim()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const coins = z.number().int().min(1).max(1_000_000);
const idParams = validate({ params: z.object({ id: objectId }).strict() });

// mounted at /api/v1/economy — the signed-in player's (fictional) money
export function createEconomyRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  // WALLET
  router.get(
    '/wallet',
    catchAsync(async (req, res) => sendSuccess(res, { wallet: await getWallet(req.player) })),
  );
  router.post(
    '/wallet/allowance',
    catchAsync(async (req, res) => sendSuccess(res, { wallet: await claimAllowance(req.player) })),
  );
  router.get(
    '/wallet/transactions',
    validate({
      query: z
        .object({
          before: objectId.optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          kind: z.enum(LEDGER_KINDS).optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await history(req.player, req.validated.query)),
    ),
  );
  router.get(
    '/wallet/budget',
    catchAsync(async (req, res) => sendSuccess(res, { budget: await budgetSummary(req.player) })),
  );
  router.patch(
    '/wallet/plan',
    validate({
      body: z
        .object({
          weeklyBudget: z.number().int().min(0).max(1_000_000).nullable().optional(),
          savingsGoal: z
            .object({ label: z.string().trim().min(2).max(60), target: coins })
            .strict()
            .nullable()
            .optional(),
        })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(res, { wallet: await setPlan(req.player, req.validated.body) }),
    ),
  );
  router.post(
    '/wallet/savings',
    validate({
      body: z
        .object({ direction: z.enum(['deposit', 'withdraw']), amount: coins, requestKey })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(res, { wallet: await moveSavings(req.player, req.validated.body) }),
    ),
  );

  // BILLS
  router.get(
    '/bills',
    catchAsync(async (req, res) => sendSuccess(res, { bills: await listBills(req.player) })),
  );
  router.post(
    '/bills/:id/pay',
    idParams,
    catchAsync(async (req, res) => {
      const bill = await payBill(req.player, req.validated.params.id);
      sendSuccess(res, { bill, wallet: await getWallet(req.player) });
    }),
  );

  // SHOP & INVENTORY
  router.get(
    '/shop',
    catchAsync(async (req, res) => sendSuccess(res, { items: await listShop(req.player) })),
  );
  router.post(
    '/purchases',
    validate({
      body: z
        .object({ itemKey: key, quantity: z.number().int().min(1).max(50).default(1), requestKey })
        .strict(),
    }),
    catchAsync(async (req, res) => {
      const result = await purchase(req.player, req.validated.body);
      sendSuccess(
        res,
        { ...result, wallet: await getWallet(req.player) },
        { statusCode: result.duplicate ? 200 : 201 },
      );
    }),
  );
  router.get(
    '/inventory',
    catchAsync(async (req, res) => sendSuccess(res, { items: await listInventory(req.player) })),
  );
  router.post(
    '/inventory/:itemKey/use',
    validate({ params: z.object({ itemKey: key }).strict() }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await useItem(req.player, req.validated.params.itemKey)),
    ),
  );
  router.post(
    '/gifts',
    validate({
      body: z
        .object({
          itemKey: key,
          quantity: z.number().int().min(1).max(20).default(1),
          toPlayerId: objectId,
        })
        .strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        { gift: await giftItem(req.player, req.validated.body) },
        { statusCode: 201 },
      ),
    ),
  );

  // HUSTLES
  router.get(
    '/hustles',
    catchAsync(async (req, res) => sendSuccess(res, { hustles: await listHustles(req.player) })),
  );
  router.post(
    '/hustles/:key/jobs',
    validate({ params: z.object({ key }).strict() }),
    catchAsync(async (req, res) =>
      sendSuccess(res, await acceptJob(req.player, req.validated.params.key), { statusCode: 201 }),
    ),
  );
  router.get(
    '/jobs',
    catchAsync(async (req, res) => sendSuccess(res, { jobs: await recentJobs(req.player) })),
  );
  router.get(
    '/jobs/:id',
    idParams,
    catchAsync(async (req, res) =>
      sendSuccess(res, await getJob(req.player, req.validated.params.id)),
    ),
  );
  router.post(
    '/jobs/:id/complete',
    validate({
      params: z.object({ id: objectId }).strict(),
      body: z.object({ answer: z.unknown().optional() }).strict(),
    }),
    catchAsync(async (req, res) =>
      sendSuccess(
        res,
        await completeJob(req.player, req.validated.params.id, req.validated.body.answer),
      ),
    ),
  );
  router.delete(
    '/jobs/:id',
    idParams,
    catchAsync(async (req, res) => {
      await abandonJob(req.player, req.validated.params.id);
      sendSuccess(res, null, { statusCode: 204 });
    }),
  );

  return router;
}

// mounted under /api/v1/admin — auditing and corrections (always with a reason, always on the ledger)
export const economyAdminRouter = express.Router();

economyAdminRouter.get(
  '/economy/players/:id/audit',
  idParams,
  catchAsync(async (req, res) => {
    const player = await Player.findById(req.validated.params.id);
    if (!player) throw AppError.notFound('Player not found.');
    const { entries } = await history(player, { limit: 100 });
    sendSuccess(res, { audit: await auditWallet(player._id), entries });
  }),
);

economyAdminRouter.post(
  '/economy/players/:id/adjustments',
  validate({
    params: z.object({ id: objectId }).strict(),
    body: z
      .object({
        amount: z
          .number()
          .int()
          .min(-1_000_000)
          .max(1_000_000)
          .refine((v) => v !== 0),
        reason: z.string().trim().min(5).max(200),
        requestKey,
      })
      .strict(),
  }),
  catchAsync(async (req, res) => {
    const player = await Player.findById(req.validated.params.id);
    if (!player) throw AppError.notFound('Player not found.');
    const { amount, reason, requestKey: rk } = req.validated.body;
    const { entry } = await post({
      player: player._id,
      amount,
      kind: 'admin-adjust',
      category: 'other',
      description: `Adjustment: ${reason}`,
      idempotencyKey: `admin:${rk}`,
      actor: req.adminActor,
    });
    req.log.warn({ player: player._id, amount, actor: req.adminActor }, 'Wallet adjusted by admin');
    sendSuccess(res, { entry }, { statusCode: 201 });
  }),
);

economyAdminRouter.post(
  '/economy/catalogue/import',
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
    const report = await importEconomy(req.body, { dryRun: req.validated.query.dryRun });
    if (!report.valid)
      return next(
        new AppError(
          `The catalogue has ${report.errors.length} problem(s).`,
          422,
          'CATALOGUE_INVALID',
          report.errors,
        ),
      );
    sendSuccess(res, { report }, { statusCode: report.dryRun ? 200 : 201 });
  }),
);
