/*
 * Content tool for the economy catalogue and games packs.
 *
 *   npm run economy:import -- data/economy/global.json [--dry-run] [--allow-remote]
 *   npm run games:import   -- data/games/unilag.json  [--dry-run] [--allow-remote]
 *
 * Both validate against the database first (wardrobe items, universities, locations);
 * --dry-run stops there. Non-local databases need --allow-remote.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { createLogger } from '../src/core/logger.js';
import { connectDB, disconnectDB, maskUri } from '../src/core/db/connect.js';
import { importEconomy } from '../src/modules/economy/economy.import.js';
import { importGamesPack } from '../src/modules/games/games.import.js';

dotenv.config({ quiet: true });

const env = parseEnv();
const logger = createLogger({ level: 'info', pretty: true });
const [kind, file, ...flags] = process.argv.slice(2);
const IMPORTERS = { economy: importEconomy, games: importGamesPack };
const isLocalUri = (uri) => /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri);

async function main() {
  if (!IMPORTERS[kind] || !file) {
    logger.error('Usage: content-pack.js <economy|games> <file.json> [--dry-run] [--allow-remote]');
    return 1;
  }
  if (!isLocalUri(env.MONGODB_URI) && !flags.includes('--allow-remote')) {
    logger.error(
      `💥 Refusing to import into a non-local database (${maskUri(env.MONGODB_URI)}). Re-run with --allow-remote if you are sure.`,
    );
    return 1;
  }
  const raw = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  const dryRun = flags.includes('--dry-run');
  await connectDB({
    uri: buildDatabaseUri(env),
    dbName: env.MONGODB_DB_NAME,
    dnsServers: env.DNS_SERVERS,
    logger,
    retries: 1,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    autoIndex: !env.isProduction,
  });
  try {
    const report = await IMPORTERS[kind](raw, { dryRun });
    report.errors.forEach((el) => logger.error(`✗ ${el.path}: ${el.message}`));
    if (!report.valid) {
      logger.error(`💥 ${report.errors.length} problem(s). Nothing was imported.`);
      return 1;
    }
    logger.info(report.summary, dryRun ? '✓ Dry run passed — nothing written' : '✓ Imported');
    if (report.results) logger.info(report.results, 'Results');
    return 0;
  } finally {
    await disconnectDB();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    logger.error({ err: err.message }, '💥 Content tool failed');
    process.exitCode = 1;
  });
