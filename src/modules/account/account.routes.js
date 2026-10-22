import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import { apiRateLimit } from '../../core/middleware/security.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import { clearAuthCookies, startLogin } from '../auth/auth.tokens.js';
import { passwordRule } from '../auth/auth.schemas.js';
import { changePassword, deleteAccount, exportAccount } from './account.service.js';

const passwordSchema = z
  .object({ currentPassword: z.string().min(1).max(200), newPassword: passwordRule })
  .strict();
const deleteSchema = z
  .object({ password: z.string().min(1).max(200), confirm: z.string().max(40) })
  .strict();

// mounted at /api/v1/account — the signed-in player's own account and data rights
export function createAccountRouter(env) {
  const router = express.Router();
  router.use(protect(env));
  // password checks are brute-forceable: same budget as login
  const sensitive = apiRateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
  });
  // an export reads every collection: a few per window is plenty
  const exportLimit = apiRateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: 5 });

  router.patch(
    '/password',
    sensitive,
    validate({ body: passwordSchema }),
    catchAsync(async (req, res) => {
      const user = await changePassword(req.user._id, req.validated.body);
      // every other device is signed out; this one gets a fresh session
      await startLogin(res, env, { user, userAgent: req.get('user-agent') });
      req.log.info({ user: user.id }, 'Password changed');
      sendSuccess(res, { changed: true });
    }),
  );

  router.get(
    '/export',
    exportLimit,
    catchAsync(async (req, res) => {
      const data = await exportAccount(req.user._id);
      res.set('Content-Disposition', 'attachment; filename="campus-life-my-data.json"');
      res.set('Cache-Control', 'no-store');
      sendSuccess(res, { export: data });
    }),
  );

  router.delete(
    '/',
    sensitive,
    validate({ body: deleteSchema }),
    catchAsync(async (req, res) => {
      const summary = await deleteAccount(req.user._id, req.validated.body);
      clearAuthCookies(res, env);
      req.log.info({ user: req.user.id, erased: summary.erased }, 'Account deleted');
      sendSuccess(res, { deleted: true });
    }),
  );

  return router;
}
