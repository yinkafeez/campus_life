import AppError from '../errors/AppError.js';
import catchAsync from '../http/catchAsync.js';
import User from '../../modules/auth/user.model.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../../modules/auth/auth.tokens.js';

// the access token from the httpOnly cookie (browser) or an Authorization header (tools/tests)
export function readAccessToken(req) {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.cookies?.[ACCESS_COOKIE] || null;
}

/** Load the signed-in user from a token, or throw a 401 AppError. */
export async function authenticate(env, token) {
  if (!token) throw AppError.unauthorized('Please sign in to continue.');

  const decoded = verifyAccessToken(env, token);
  const user = await User.findById(decoded.sub).select('+tokenVersion +suspendedUntil');
  if (!user) throw new AppError('This account no longer exists.', 401, 'INVALID_TOKEN');
  // "log out everywhere" / password change bump tokenVersion
  if ((user.tokenVersion ?? 0) !== decoded.ver) {
    throw new AppError('Your session has ended. Please sign in again.', 401, 'SESSION_REVOKED');
  }
  // suspended by a moderator
  if (user.suspendedUntil && user.suspendedUntil > new Date()) {
    throw new AppError(
      `Your account is suspended until ${user.suspendedUntil.toISOString().slice(0, 10)}.`,
      403,
      'ACCOUNT_SUSPENDED',
    );
  }
  return { user, sessionId: decoded.sid, expiresAt: decoded.exp ? decoded.exp * 1000 : null };
}

// PROTECTED ROUTE MIDDLEWARE
export const protect = (env) =>
  catchAsync(async (req, res, next) => {
    const { user, sessionId } = await authenticate(env, readAccessToken(req));
    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = user;
    req.auth = { sessionId };
    next();
  });

// only some roles may continue (use after protect)
export const restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
