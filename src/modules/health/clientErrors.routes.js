import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { apiRateLimit } from '../../core/middleware/security.js';

/*
 * CLIENT ERROR REPORTING — the game posts crashes it can't recover from (a render error, an
 * unhandled promise) so they show up in the server logs next to API errors, without any
 * third-party service. Anonymous (crashes can happen before sign-in), small, rate-limited,
 * and nothing personal is accepted: no free-form user data, URLs stripped of query strings.
 */
const report = z
  .object({
    kind: z.enum(['render', 'error', 'unhandledrejection']),
    message: z.string().trim().min(1).max(500),
    stack: z.string().max(4000).optional(),
    route: z
      .string()
      .max(200)
      .transform((val) => val.split(/[?#]/)[0])
      .optional(),
    release: z.string().max(40).optional(),
    userAgent: z.string().max(300).optional(),
  })
  .strict();

// mounted at /api/v1/client-errors
export function createClientErrorsRouter(env) {
  const router = express.Router();
  router.post(
    '/',
    apiRateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: 30 }),
    validate({ body: report }),
    (req, res) => {
      req.log.warn({ clientError: req.validated.body }, 'Client error reported');
      res.status(204).end();
    },
  );
  return router;
}
