import dns from 'node:dns';
import dotenv from 'dotenv';

import { parseEnv } from './src/config/env.js';
import { createLogger } from './src/core/logger.js';
import { connectDB, disconnectDB, maskUri } from './src/core/db/connect.js';

// handling uncaught exceptions (bugs in sync code) — the process is in an unclean state, so crash
process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1); // 0 - success, 1 - uncaught exception
});

dotenv.config({ path: './.env', quiet: true });

// validate every setting once (fails fast listing each bad or placeholder value)
let env;
try {
  env = parseEnv(process.env, { forServer: true });
} catch (err) {
  console.error(
    `💥 ${err.message}\nFix the values above in backend/.env (see .env.example for every setting).`,
  );
  process.exit(1);
}

const logger = createLogger({ level: env.LOG_LEVEL, pretty: !env.isProduction });

// imported after the env is loaded and checked
const { createApp } = await import('./src/app.js');
const app = createApp({ env, logger });

// these lines fix the DNSException error (querySrv ECONNREFUSED on some Windows networks):
if (env.DNS_SERVERS?.length) {
  dns.setServers(env.DNS_SERVERS); // e.g. Google & Cloudflare DNS lookups (DNS_SERVERS in .env)
}

// the <db_password> placeholder in MONGODB_URI is replaced with DB_PASSWORD from .env
// (encoded, so characters like @ : / ? # in the password can't break the URI)
const DB = env.MONGODB_URI.replace('<db_password>', () =>
  encodeURIComponent(env.DB_PASSWORD ?? ''),
).replace('<db_username>', () => encodeURIComponent(env.DB_USERNAME ?? ''));

// production: the API is useless without MongoDB → fail fast so the host restarts us.
// development: keep the server up (health shows db: disconnected) and keep retrying in the background.
const shutdownController = new AbortController();
const dbOptions = {
  uri: DB,
  dbName: env.MONGODB_DB_NAME,
  logger,
  retryDelayMs: env.MONGODB_RETRY_DELAY_MS,
  serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  // build indexes automatically outside production; in production run `npm run db:indexes`
  autoIndex: !env.isProduction,
  signal: shutdownController.signal,
};

if (env.isProduction) {
  try {
    await connectDB({ ...dbOptions, retries: env.MONGODB_CONNECT_RETRIES });
  } catch (err) {
    logger.fatal({ err: err.message }, '💥 DATABASE CONNECTION FAILED — cannot start');
    process.exit(1);
  }
} else {
  connectDB({ ...dbOptions, retries: Infinity }).catch((err) => {
    if (err.name !== 'AbortError')
      logger.error({ err: err.message }, '💥 DATABASE CONNECTION FAILED');
  });
  logger.info(
    { uri: maskUri(DB), db: env.MONGODB_DB_NAME },
    'Connecting to MongoDB in the background — the API answers meanwhile (/api/v1/health shows the DB state)',
  );
}

// START SERVER
// (Express 5 calls the listen callback with the error too, e.g. EADDRINUSE)
const port = env.PORT || 5000;
const server = app.listen(port, (err) => {
  if (err) {
    logger.fatal(
      { err: err.message },
      `💥 Could not start the HTTP server on port ${port} — is another server already using it?`,
    );
    process.exit(1);
  }
  logger.info(`App running on port ${port} (${env.NODE_ENV})...`);
});

// REALTIME — Socket.IO shares the HTTP server (same port, path /socket.io)
const { attachRealtime } = await import('./src/core/realtime/socket.js');
const io = attachRealtime(server, { env, logger });

// GRACEFUL SHUTDOWN — stop accepting requests, finish in-flight ones, close the DB
let shuttingDown = false;
function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received. Shutting down gracefully...`);

  shutdownController.abort();
  io.close();
  // force-exit if something hangs
  setTimeout(() => process.exit(exitCode || 1), 10_000).unref();

  server.close(async () => {
    await disconnectDB().catch(() => {});
    logger.info('💥 Process terminated');
    process.exit(exitCode);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// handling unhandled promise rejections — close the server gracefully, then exit
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'UNHANDLED REJECTION! 💥 Shutting down...');
  shutdown('unhandledRejection', 1); // 0 - success, 1 - unhandled rejection
});
