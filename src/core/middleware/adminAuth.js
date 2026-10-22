import { createHash, timingSafeEqual } from 'node:crypto';
import AppError from '../errors/AppError.js';
import { authenticate, readAccessToken } from './auth.js';

/*
 * ADMIN GATE — either of:
 *   1) the operator key: ADMIN_API_KEY sent as  X-Admin-Key: <key>  (scripts, CI, first setup)
 *   2) a signed-in account with role "admin"  (browser; promote with `npm run user:role`)
 * Runs before the admin body parser, so unauthorised callers never get a large body read.
 */
const digest = (value) => createHash('sha256').update(value).digest();

export function requireAdmin(env) {
  const expected = env.ADMIN_API_KEY ? digest(env.ADMIN_API_KEY) : null;

  return async (req, res, next) => {
    try {
      const suppliedKey =
        typeof req.headers['x-admin-key'] === 'string' ? req.headers['x-admin-key'].trim() : null;

      // 1) operator key
      if (suppliedKey) {
        if (!expected) {
          return next(
            AppError.unavailable('Admin keys are disabled on this server.', 'ADMIN_DISABLED'),
          );
        }
        // compare fixed-length digests in constant time (no length or timing leaks)
        if (!timingSafeEqual(digest(suppliedKey), expected)) {
          req.log?.warn('Rejected admin request with an invalid key');
          return next(AppError.forbidden('Invalid admin key.'));
        }
        req.isAdmin = true;
        req.adminActor = 'admin-key';
        return next();
      }

      // 2) admin account
      const token = readAccessToken(req);
      if (!token) return next(AppError.unauthorized('An admin key or admin account is required.'));
      const { user } = await authenticate(env, token);
      if (user.role !== 'admin') return next(AppError.forbidden());

      req.user = user;
      req.isAdmin = true;
      req.adminActor = `user:${user.id}`;
      next();
    } catch (err) {
      next(err);
    }
  };
}
