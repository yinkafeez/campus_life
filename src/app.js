import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { pinoHttp } from 'pino-http';

import {
  securityHeaders,
  corsPolicy,
  apiRateLimit,
  requireJsonWrites,
} from './core/middleware/security.js';
import { genRequestId } from './core/middleware/requestId.js';
import { createErrorHandler } from './core/errors/errorHandler.js';
import notFound from './core/errors/notFound.js';
import { requireAdmin } from './core/middleware/adminAuth.js';
import requireDb from './core/db/requireDb.js';
import healthRouter from './modules/health/health.routes.js';
import { createClientErrorsRouter } from './modules/health/clientErrors.routes.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createPlayersRouter } from './modules/players/players.routes.js';
import { createAccountRouter } from './modules/account/account.routes.js';
import { createStudentsRouter } from './modules/students/students.routes.js';
import {
  createCharactersRouter,
  createWardrobeRouter,
} from './modules/wardrobe/characters.routes.js';
import universitiesRouter from './modules/universities/universities.routes.js';
import adminRouter from './modules/admin/admin.routes.js';
import { createCampusWorldRouter } from './modules/campus/campusWorld.routes.js';
import { createSocialRouter } from './modules/social/social.routes.js';
import { createMessagingRouter } from './modules/messaging/messaging.routes.js';
import {
  createReportsRouter,
  moderationAdminRouter,
} from './modules/moderation/moderation.routes.js';
import {
  accommodationAdminRouter,
  createAccommodationRouter,
} from './modules/accommodation/accommodation.routes.js';
import { createCommunityRouter } from './modules/community/community.routes.js';
import { createLearningRouter, learningAdminRouter } from './modules/learning/learning.routes.js';
import { createEconomyRouter, economyAdminRouter } from './modules/economy/economy.routes.js';
import { createGamesRouter, gamesAdminRouter } from './modules/games/games.routes.js';
import {
  createElectionsRouter,
  electionsAdminRouter,
} from './modules/elections/elections.routes.js';

/**
 * Build the Express app. Takes its config instead of reading process.env,
 * so tests can create an app with any settings.
 */
export function createApp({ env, logger }) {
  const app = express();

  // 1) GLOBAL MIDDLEWARES
  // behind Render / Nginx: trust that many proxies so req.ip and req.secure are correct
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  // request id + structured request logging (health probes are too noisy to log)
  app.use(
    pinoHttp({
      logger,
      genReqId: genRequestId,
      autoLogging: { ignore: (req) => req.url.startsWith('/api/v1/health') },
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  // security HTTP headers
  app.use(securityHeaders());
  // allow the frontend origins (with cookies)
  app.use(corsPolicy(env.CLIENT_URL || env.PROD_CLIENT_URLs));

  // limit requests from the same IP
  app.use('/api', apiRateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX }));

  // only JSON bodies on writes (CSRF defence in depth, see security.js)
  app.use('/api', requireJsonWrites());

  // cookie parser, reading the httpOnly auth cookies into req.cookies
  app.use(cookieParser());

  // ADMIN: stricter limit + admin check BEFORE the large body parser, so unauthorised callers
  // can never make the server read a big body (the global parser below then skips it)
  app.use(
    '/api/v1/admin',
    apiRateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.ADMIN_RATE_LIMIT_MAX }),
    requireDb,
    requireAdmin(env),
    express.json({ limit: env.ADMIN_JSON_BODY_LIMIT }),
  );

  // body parser, reading data from body into req.body (small limit: this is a JSON API)
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

  app.use(compression());

  // 2) ROUTES
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/client-errors', createClientErrorsRouter(env));
  app.use('/api/v1/auth', requireDb, createAuthRouter(env));
  app.use('/api/v1/players', requireDb, createPlayersRouter(env));
  app.use('/api/v1/account', requireDb, createAccountRouter(env));
  app.use('/api/v1/students', requireDb, createStudentsRouter(env));
  app.use('/api/v1/characters', requireDb, createCharactersRouter(env));
  app.use('/api/v1/wardrobe', requireDb, createWardrobeRouter(env));
  app.use('/api/v1/universities', requireDb, universitiesRouter);
  app.use('/api/v1/campus', requireDb, createCampusWorldRouter(env));
  app.use('/api/v1/social', requireDb, createSocialRouter(env));
  app.use('/api/v1/messages', requireDb, createMessagingRouter(env));
  app.use('/api/v1/reports', requireDb, createReportsRouter(env));
  app.use('/api/v1/accommodation', requireDb, createAccommodationRouter(env));
  app.use('/api/v1/community', requireDb, createCommunityRouter(env));
  app.use('/api/v1/learning', requireDb, createLearningRouter(env));
  app.use('/api/v1/economy', requireDb, createEconomyRouter(env));
  app.use('/api/v1/games', requireDb, createGamesRouter(env));
  app.use('/api/v1/elections', requireDb, createElectionsRouter(env));
  app.use(
    '/api/v1/admin',
    adminRouter,
    moderationAdminRouter,
    accommodationAdminRouter,
    learningAdminRouter,
    economyAdminRouter,
    gamesAdminRouter,
    electionsAdminRouter,
  );

  // handling unhandled routes
  app.all('*path', notFound);

  // GLOBAL ERROR HANDLING MIDDLEWARE
  app.use(createErrorHandler({ isProduction: env.isProduction }));

  return app;
}

export default createApp;
