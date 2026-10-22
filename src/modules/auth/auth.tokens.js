import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import Session from './session.model.js';
import User from './user.model.js';

/*
 * TOKENS & COOKIES
 *   cl_access  — JWT (HS256, ACCESS_TOKEN_TTL_MINUTES), httpOnly, sent on every API call
 *   cl_refresh — "<sessionId>.<random secret>", httpOnly, sent ONLY to /api/v1/auth,
 *                rotated on every use; the database keeps just a SHA-256 hash of the secret
 */
export const ACCESS_COOKIE = 'cl_access';
export const REFRESH_COOKIE = 'cl_refresh';
const REFRESH_PATH = '/api/v1/auth';
const ISSUER = 'campus-life';
// two tabs refreshing at the same moment is not theft: allow the loser a short grace period
const ROTATION_GRACE_MS = 10_000;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const sameHash = (a, b) => {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

const cookieOptions = (env, { path, maxAge }) => ({
  httpOnly: true,
  // SameSite=None requires Secure; production is always HTTPS
  secure: env.isProduction || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path,
  maxAge,
});

export function signAccessToken(env, { user, session }) {
  return jwt.sign(
    { sid: String(session._id), ver: user.tokenVersion ?? 0 },
    env.JWT_ACCESS_SECRET,
    {
      subject: String(user._id),
      expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
      issuer: ISSUER,
      algorithm: 'HS256',
    },
  );
}

/** Verify an access token; maps library errors to stable API codes. */
export function verifyAccessToken(env, token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Your session has expired. Please sign in again.', 401, 'TOKEN_EXPIRED');
    }
    throw new AppError('Invalid session. Please sign in again.', 401, 'INVALID_TOKEN');
  }
}

/** Start a new refresh-token family (login / register) or continue one (rotation). */
export async function issueSession(env, { user, family = randomUUID(), userAgent }) {
  const secret = randomBytes(32).toString('base64url');
  const session = await Session.create({
    user: user._id,
    family,
    tokenHash: sha256(secret),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    userAgent: userAgent?.slice(0, 300),
    lastUsedAt: new Date(),
  });
  return { session, refreshToken: `${session._id}.${secret}` };
}

export function setAuthCookies(res, env, { accessToken, refreshToken }) {
  res.cookie(
    ACCESS_COOKIE,
    accessToken,
    cookieOptions(env, {
      path: '/',
      maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60_000,
    }),
  );
  res.cookie(
    REFRESH_COOKIE,
    refreshToken,
    cookieOptions(env, {
      path: REFRESH_PATH,
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    }),
  );
}

export function clearAuthCookies(res, env) {
  const { maxAge, ...base } = cookieOptions(env, { path: '/', maxAge: 0 });
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_PATH });
}

/** Sign in a user on this device: new session + both cookies. */
export async function startLogin(res, env, { user, userAgent }) {
  const { session, refreshToken } = await issueSession(env, { user, userAgent });
  setAuthCookies(res, env, { accessToken: signAccessToken(env, { user, session }), refreshToken });
  return session;
}

const parseRefreshToken = (raw) => {
  const [id, secret, extra] = typeof raw === 'string' ? raw.split('.') : [];
  if (!secret || extra !== undefined || !mongoose.isValidObjectId(id)) return null;
  return { id, secret };
};

const refreshFailed = (message, code = 'INVALID_REFRESH') => new AppError(message, 401, code);

/**
 * Exchange a refresh token for a new pair (ROTATION).
 * Reusing an already-rotated token revokes the whole family (likely theft).
 */
export async function rotateRefreshToken(env, rawToken, { userAgent } = {}) {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) throw refreshFailed('Please sign in again.');

  const current = await Session.findById(parsed.id).select('+tokenHash');
  if (!current || !sameHash(current.tokenHash, sha256(parsed.secret))) {
    throw refreshFailed('Please sign in again.');
  }

  if (current.revokedAt) {
    const recentRotation =
      current.revokedReason === 'rotated' &&
      Date.now() - current.revokedAt.getTime() < ROTATION_GRACE_MS;
    if (recentRotation) throw refreshFailed('Session refreshed in another tab.', 'REFRESH_RACE');

    if (current.revokedReason === 'rotated') {
      // an old token came back: someone else has it — end every session in this family
      await Session.updateMany(
        { family: current.family, revokedAt: mongoose.trusted({ $exists: false }) },
        { $set: { revokedAt: new Date(), revokedReason: 'reuse-detected' } },
      );
      throw refreshFailed('For your security, please sign in again.', 'REFRESH_REUSED');
    }
    throw refreshFailed('Your session has ended. Please sign in again.', 'SESSION_ENDED');
  }
  if (current.expiresAt <= new Date())
    throw refreshFailed('Your session has expired.', 'SESSION_EXPIRED');

  const user = await User.findById(current.user).select('+tokenVersion');
  if (!user) throw refreshFailed('Please sign in again.');

  // claim the old token atomically, so two requests can't both rotate it
  const claimed = await Session.findOneAndUpdate(
    { _id: current._id, revokedAt: mongoose.trusted({ $exists: false }) },
    { $set: { revokedAt: new Date(), revokedReason: 'rotated' } },
  );
  if (!claimed) throw refreshFailed('Session refreshed in another tab.', 'REFRESH_RACE');

  const { session, refreshToken } = await issueSession(env, {
    user,
    family: current.family,
    userAgent,
  });
  await Session.updateOne({ _id: current._id }, { $set: { replacedBy: session._id } });

  return { user, accessToken: signAccessToken(env, { user, session }), refreshToken };
}

/** End the session behind a refresh token (logout on this device). Never throws. */
export async function revokeRefreshToken(rawToken) {
  const parsed = parseRefreshToken(rawToken);
  if (!parsed) return;
  const session = await Session.findById(parsed.id).select('+tokenHash');
  if (!session || !sameHash(session.tokenHash, sha256(parsed.secret))) return;
  await Session.updateOne(
    { _id: session._id, revokedAt: mongoose.trusted({ $exists: false }) },
    { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
  );
}
