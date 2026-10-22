/*
 * Learning pack tool for administrators (game activities, missions, achievements).
 *
 *   npm run learning:validate -- data/learning/unilag.json            offline check (uses the matching university bundle)
 *   npm run learning:import   -- data/learning/unilag.json --dry-run  full check against the database, no writes
 *   npm run learning:import   -- data/learning/unilag.json            import (idempotent create/update)
 *
 * Non-local databases need --allow-remote.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { createLogger } from '../src/core/logger.js';
import { connectDB, disconnectDB, maskUri } from '../src/core/db/connect.js';
import { catalogueFromBundle, validatePack } from '../src/modules/learning/pack/validatePack.js';
import { importPack } from '../src/modules/learning/pack/importPack.js';

dotenv.config({ quiet: true });

const env = parseEnv();
const logger = createLogger({ level: 'info', pretty: true });
const [command, file, ...flags] = process.argv.slice(2);
const isLocalUri = (uri) => /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri);

const loadJson = async (filePath) => JSON.parse(await readFile(path.resolve(filePath), 'utf8'));

function printProblems(report) {
  report.errors.forEach((el) => logger.error(`✗ ${el.path}: ${el.message}`));
  (report.warnings ?? []).forEach((el) => logger.warn(`! ${el.path}: ${el.message}`));
}

async function main() {
  if (!['validate', 'import'].includes(command) || !file) {
    logger.error(
      'Usage: learning-pack.js <validate|import> <file.json> [--dry-run] [--allow-remote]',
    );
    return 1;
  }
  const raw = await loadJson(file);

  if (command === 'validate') {
    // check codes, levels and locations against the university's bundle file when we have it
    const bundlePath = path.resolve('data/universities', `${raw.university}.json`);
    const bundle = await loadJson(bundlePath).catch(() => null);
    const report = validatePack(raw, {
      catalogue: bundle ? catalogueFromBundle(bundle) : undefined,
    });
    printProblems(report);
    if (!report.valid) {
      logger.error(`💥 ${report.errors.length} problem(s) in ${file}`);
      return 1;
    }
    logger.info(
      report.summary,
      `✓ ${file} is valid${bundle ? '' : ' (no bundle found: references not checked)'}`,
    );
    return 0;
  }

  if (!isLocalUri(env.MONGODB_URI) && !flags.includes('--allow-remote')) {
    logger.error(
      `💥 Refusing to import into a non-local database (${maskUri(env.MONGODB_URI)}). Re-run with --allow-remote if you are sure.`,
    );
    return 1;
  }
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
    const report = await importPack(raw, { dryRun });
    printProblems(report);
    if (!report.valid) {
      logger.error(`💥 ${report.errors.length} problem(s). Nothing was imported.`);
      return 1;
    }
    logger.info(report.summary, dryRun ? '✓ Dry run passed — nothing written' : '✓ Imported');
    if (report.results) logger.info(report.results, 'Records created / updated / unchanged');
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
    logger.error({ err: err.message }, '💥 Learning pack tool failed');
    process.exitCode = 1;
  });
