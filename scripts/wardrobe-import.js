/*
 * Import the wardrobe catalogue (items, palettes, starter look, default outfits).
 *   npm run wardrobe:import -- [data/wardrobe/global.json] [--dry-run] [--allow-remote]
 * Idempotent. Non-local databases need --allow-remote.
 */
import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { createLogger } from '../src/core/logger.js';
import { connectDB, disconnectDB, maskUri } from '../src/core/db/connect.js';
import { importWardrobe } from '../src/modules/wardrobe/wardrobe.import.js';

dotenv.config({ quiet: true });

const env = parseEnv();
const logger = createLogger({ level: 'info', pretty: true });
const args = process.argv.slice(2);
const file = args.find((el) => !el.startsWith('--')) ?? 'data/wardrobe/global.json';
const isLocalUri = (uri) => /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri);

async function main() {
  if (!isLocalUri(env.MONGODB_URI) && !args.includes('--allow-remote')) {
    logger.error(
      `💥 Refusing to import into a non-local database (${maskUri(env.MONGODB_URI)}). Re-run with --allow-remote if you are sure.`,
    );
    return 1;
  }
  const raw = JSON.parse(await readFile(file, 'utf8'));

  await connectDB({
    uri: buildDatabaseUri(env),
    dbName: env.MONGODB_DB_NAME,
    dnsServers: env.DNS_SERVERS,
    logger,
    retries: 1,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  });
  try {
    const report = await importWardrobe(raw, { dryRun: args.includes('--dry-run') });
    report.errors.forEach((el) => logger.error(`✗ ${el.path}: ${el.message}`));
    if (!report.valid) {
      logger.error(`💥 ${report.errors.length} problem(s). Nothing was imported.`);
      return 1;
    }
    logger.info(
      report.results ?? {},
      report.dryRun ? '✓ Dry run passed — nothing written' : '✓ Wardrobe imported',
    );
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
    logger.error({ err: err.message }, '💥 Wardrobe import failed');
    process.exitCode = 1;
  });
