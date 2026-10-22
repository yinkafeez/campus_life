import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import AppError from '../errors/AppError.js';

// security headers — a pure JSON API, so the strictest CSP is fine
export const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

// allow only the configured frontend origins, with cookies
export const corsPolicy = (allowedOrigins) =>
  cors({
    origin(origin, callback) {
      // no Origin header: same-origin, curl, server-to-server, health probes
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new AppError('Origin not allowed by CORS.', 403, 'CORS_FORBIDDEN'));
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  });

// limit requests from the same IP (stricter limiters for auth routes come with the auth module)
export const apiRateLimit = ({ windowMs, limit, ...options }) =>
  rateLimit({
    windowMs,
    limit,
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(
        new AppError(
          'Too many requests from this IP, please try again later.',
          429,
          'RATE_LIMITED',
        ),
      ),
  });

/*
 * CSRF defence in depth. Auth uses cookies (SameSite=None in production, where the game and
 * the API are on different sites), so a hostile page could try to submit a form at the API.
 *   1) CORS above already refuses any request whose Origin is not an allowed frontend.
 *   2) Here: state-changing requests may only carry a JSON body. HTML forms can only send
 *      urlencoded / multipart / text/plain bodies, and anything else needs a CORS preflight.
 */
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const requireJsonWrites = () => (req, res, next) => {
  const type = req.headers['content-type'];
  if (UNSAFE.has(req.method) && type && !/^application\/json\b/i.test(type)) {
    return next(
      new AppError('Send JSON (Content-Type: application/json).', 415, 'UNSUPPORTED_MEDIA_TYPE'),
    );
  }
  return next();
};
