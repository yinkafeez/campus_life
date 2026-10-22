import express from 'express';
import validate from '../../core/middleware/validate.js';
import { apiRateLimit } from '../../core/middleware/security.js';
import { protect } from '../../core/middleware/auth.js';
import { createAuthController } from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

// mounted at /api/v1/auth
export function createAuthRouter(env) {
  const router = express.Router();
  const auth = createAuthController(env);
  const windowMs = env.RATE_LIMIT_WINDOW_MS;

  // brute-force protection: only FAILED logins count towards the limit
  const loginLimit = apiRateLimit({
    windowMs,
    limit: env.AUTH_RATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
  });
  const registerLimit = apiRateLimit({ windowMs, limit: env.AUTH_RATE_LIMIT_MAX });

  router.post('/register', registerLimit, validate({ body: registerSchema }), auth.register);
  router.post('/login', loginLimit, validate({ body: loginSchema }), auth.login);
  // refresh tokens are random 256-bit secrets, but still: no unlimited guessing
  const sessionLimit = apiRateLimit({ windowMs, limit: env.AUTH_RATE_LIMIT_MAX * 10 });
  router.post('/refresh', sessionLimit, auth.refresh);
  router.post('/logout', sessionLimit, auth.logout);

  // protect all routes after this middleware
  router.use(protect(env));
  router.get('/me', auth.getMe);
  router.post('/logout-all', auth.logoutAll);

  return router;
}
