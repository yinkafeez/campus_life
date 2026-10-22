import bcrypt from 'bcryptjs';
import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import User from './user.model.js';
import Session from './session.model.js';
import Player from '../players/player.model.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  revokeRefreshToken,
  rotateRefreshToken,
  setAuthCookies,
  startLogin,
} from './auth.tokens.js';

// same answer for "no such user" and "wrong password" — never reveal which accounts exist
const INVALID_CREDENTIALS = () =>
  new AppError('Incorrect email/username or password.', 401, 'INVALID_CREDENTIALS');

// compared against when the user doesn't exist, so both paths take the same time
const DUMMY_HASH = bcrypt.hashSync('campus-life-timing-equaliser', 12);

const userAgentOf = (req) => req.get('user-agent');

export function createAuthController(env) {
  // SIGNUP — creates the account and its player profile, then signs in
  const register = catchAsync(async (req, res, next) => {
    const { email, username, password, displayName } = req.validated.body;

    const taken = await User.findOne({
      $or: [{ email }, { username }],
    }).select('email username');
    if (taken) {
      const field = taken.email === email ? 'email' : 'username';
      return next(
        new AppError(`That ${field} is already registered.`, 409, 'ACCOUNT_EXISTS', [
          { path: field, message: 'Already registered' },
        ]),
      );
    }

    const user = await User.create({
      email,
      username,
      passwordHash: await User.hashPassword(password),
    });
    const player = await Player.create({ user: user._id, displayName });

    await startLogin(res, env, { user, userAgent: userAgentOf(req) });
    req.log.info({ user: user.id }, 'Player registered');
    sendSuccess(res, { user, player }, { statusCode: 201 });
  });

  // LOGIN — email or username
  const login = catchAsync(async (req, res, next) => {
    const { identifier, password } = req.validated.body;

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    }).select('+passwordHash +failedLoginCount +lockedUntil +tokenVersion');

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return next(INVALID_CREDENTIALS());
    }

    if (user.isLocked()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      return next(
        new AppError(
          `Too many failed sign-in attempts. Try again in ${minutes} minute(s).`,
          429,
          'ACCOUNT_LOCKED',
        ),
      );
    }

    if (!(await user.correctPassword(password))) {
      const failures = (user.failedLoginCount ?? 0) + 1;
      const lock = failures >= env.AUTH_MAX_FAILED_LOGINS;
      await User.updateOne(
        { _id: user._id },
        lock
          ? {
              $set: {
                failedLoginCount: 0,
                lockedUntil: new Date(Date.now() + env.AUTH_LOCK_MINUTES * 60_000),
              },
            }
          : { $set: { failedLoginCount: failures } },
      );
      if (lock) req.log.warn({ user: user.id }, 'Account locked after repeated failed logins');
      return next(INVALID_CREDENTIALS());
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } },
    );
    await startLogin(res, env, { user, userAgent: userAgentOf(req) });

    const player = await Player.findOne({ user: user._id });
    sendSuccess(res, { user, player });
  });

  // REFRESH — rotate the refresh token, issue a new access token
  const refresh = catchAsync(async (req, res) => {
    try {
      const { user, accessToken, refreshToken } = await rotateRefreshToken(
        env,
        req.cookies?.[REFRESH_COOKIE],
        { userAgent: userAgentOf(req) },
      );
      setAuthCookies(res, env, { accessToken, refreshToken });
      sendSuccess(res, { user });
    } catch (err) {
      // a dead refresh token is useless: clear it (except in a benign two-tab race)
      if (err.code !== 'REFRESH_RACE') clearAuthCookies(res, env);
      throw err;
    }
  });

  // LOGOUT — this device only; always succeeds
  const logout = catchAsync(async (req, res) => {
    await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, env);
    sendSuccess(res, null, { statusCode: 204 });
  });

  // LOGOUT EVERYWHERE — invalidates every access token and session of this user
  const logoutAll = catchAsync(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
    await Session.updateMany(
      { user: req.user._id, revokedAt: mongoose.trusted({ $exists: false }) },
      { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
    );
    clearAuthCookies(res, env);
    sendSuccess(res, null, { statusCode: 204 });
  });

  // GET CURRENT USER
  const getMe = catchAsync(async (req, res) => {
    const player = await Player.findOne({ user: req.user._id });
    sendSuccess(res, { user: req.user, player });
  });

  return { register, login, refresh, logout, logoutAll, getMe };
}
