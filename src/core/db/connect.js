import { setTimeout as sleep } from 'node:timers/promises';
import dns from 'node:dns';
import mongoose from './mongoose.js';

const STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const MAX_RETRY_DELAY_MS = 30_000;

// hide credentials before a connection string goes anywhere near a log
export const maskUri = (uri = '') => uri.replace(/\/\/[^@/]+@/, '//***:***@');

export const isDbConnected = () => mongoose.connection.readyState === 1;

export function getDbStatus() {
  return {
    state: STATES[mongoose.connection.readyState] ?? 'unknown',
    name: mongoose.connection.name || null,
  };
}

let listenersAttached = false;
// true while WE are closing the connection (shutdown, scripts) — not a fault worth a warning
let closing = false;

// log connection life-cycle changes once, however many times connectDB runs
function attachListeners(logger) {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('disconnected', () =>
    closing ? logger.info('DB connection closed') : logger.warn('DB disconnected'),
  );
  mongoose.connection.on('reconnected', () => logger.info('DB reconnected'));
  mongoose.connection.on('error', (err) =>
    logger.error({ err: err.message }, 'DB connection error'),
  );
}

/**
 * Connect mongoose, retrying with exponential backoff (capped at 30s).
 * - retries: number of attempts (Infinity = keep trying until connected or aborted)
 * - signal: AbortSignal to stop retrying (e.g. on shutdown)
 * Resolves with the connection, rejects after the last failed attempt.
 */
export async function connectDB({
  uri,
  logger,
  retries = 5,
  retryDelayMs = 2000,
  serverSelectionTimeoutMS = 5000,
  autoIndex = true,
  dbName,
  dnsServers,
  signal,
}) {
  attachListeners(logger);
  // custom resolvers for the mongodb+srv SRV lookup (see DNS_SERVERS in .env.example)
  if (dnsServers?.length) dns.setServers(dnsServers);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    signal?.throwIfAborted();

    try {
      // eslint-disable-next-line no-await-in-loop -- attempts must run one after another
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS,
        autoIndex,
        ...(dbName && { dbName }),
      });
      logger.info({ db: mongoose.connection.name, uri: maskUri(uri) }, 'DB connection successful!');
      return mongoose.connection;
    } catch (err) {
      const last = attempt >= retries;
      logger.warn(
        {
          attempt,
          retries: Number.isFinite(retries) ? retries : 'unlimited',
          reason: err.message,
        },
        last ? '💥 DB connection failed' : 'DB connection attempt failed — retrying',
      );
      if (last) {
        throw new Error(`Could not connect to MongoDB at ${maskUri(uri)}: ${err.message}`, {
          cause: err,
        });
      }

      const delay = Math.min(retryDelayMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay, undefined, { signal });
    }
  }

  // only reachable with retries < 1
  throw new Error('connectDB needs at least one attempt (retries >= 1)');
}

export async function disconnectDB() {
  closing = true;
  try {
    await mongoose.disconnect();
  } finally {
    closing = false;
  }
}
