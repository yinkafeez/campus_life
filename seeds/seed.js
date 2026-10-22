/*
 * DEVELOPMENT SEED SCRIPT — never for production data.
 *   npm run seed         → insert/update the dev seed sets (idempotent)
 *   npm run seed:reset   → delete ONLY the seeded universities and their records
 *
 * Safety: refuses to run when NODE_ENV=production, and refuses remote (mongodb+srv / non-local)
 * databases unless --allow-remote is passed explicitly.
 */
import dotenv from 'dotenv';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { createLogger } from '../src/core/logger.js';
import { connectDB, disconnectDB, maskUri } from '../src/core/db/connect.js';
import { importSeeds, resetSeeds } from './seeder.js';

dotenv.config({ quiet: true });

const env = parseEnv();
const logger = createLogger({ level: 'info', pretty: true });
const args = process.argv.slice(2);
const mode = args.includes('--reset') ? 'reset' : args.includes('--import') ? 'import' : null;

const isLocalUri = (uri) => /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri);

function guard() {
  if (!mode) return 'Pass --import or --reset.';
  if (env.isProduction) return 'Seeding is disabled when NODE_ENV=production.';
  if (!isLocalUri(env.MONGODB_URI) && !args.includes('--allow-remote')) {
    return `Refusing to seed a non-local database (${maskUri(env.MONGODB_URI)}). Re-run with --allow-remote if you are sure.`;
  }
  return null;
}

const problem = guard();
if (problem) {
  logger.error(`💥 ${problem}`);
  process.exit(1);
}

try {
  await connectDB({
    uri: buildDatabaseUri(env),
    dbName: env.MONGODB_DB_NAME,
    dnsServers: env.DNS_SERVERS,
    logger,
    retries: 1,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  });

  if (mode === 'import') {
    const summary = await importSeeds();
    summary.forEach((el) => logger.info(el, `Seeded ${el.slug}`));
    logger.info('Data successfully loaded!');
  } else {
    const deleted = await resetSeeds(undefined, {
      includePlayers: args.includes('--include-players'),
    });
    logger.info(deleted, 'Seed data successfully deleted!');
  }
} catch (err) {
  logger.error(
    { err: err.message, details: err.errors && Object.keys(err.errors) },
    '💥 Seed script failed',
  );
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
