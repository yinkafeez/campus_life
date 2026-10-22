/*
 * University bundle tool for administrators (server access = authorised).
 *
 *   npm run university:validate -- <file.json>             offline structural + consistency check
 *   npm run university:import   -- <file.json> --dry-run   full check against the database, no writes
 *   npm run university:import   -- <file.json>             import (idempotent create/update)
 *
 * Non-local databases need --allow-remote (protects production from a mistyped .env).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { createLogger } from '../src/core/logger.js';
import { connectDB, disconnectDB, maskUri } from '../src/core/db/connect.js';
import { validateBundle } from '../src/modules/universities/bundle/validateBundle.js';
import { importBundle } from '../src/modules/universities/bundle/importBundle.js';

dotenv.config({ quiet: true });

const env = parseEnv();
const logger = createLogger({ level: 'info', pretty: true });
const [command, file, ...flags] = process.argv.slice(2);

const isLocalUri = (uri) => /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri);

function printProblems(report) {
  report.errors.forEach((el) => logger.error(`✗ ${el.path}: ${el.message}`));
  report.warnings.forEach((el) => logger.warn(`! ${el.path}: ${el.message}`));
}

async function loadJson(filePath) {
  const text = await readFile(path.resolve(filePath), 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${filePath} is not valid JSON: ${err.message}`, { cause: err });
  }
}

async function main() {
  if (!['validate', 'import'].includes(command) || !file) {
    logger.error(
      'Usage: university-bundle.js <validate|import> <file.json> [--dry-run] [--allow-remote]',
    );
    return 1;
  }

  const raw = await loadJson(file);

  if (command === 'validate') {
    const report = validateBundle(raw);
    printProblems(report);
    if (!report.valid) {
      logger.error(`💥 ${report.errors.length} problem(s) in ${file}`);
      return 1;
    }
    logger.info(report.summary, `✓ ${file} is valid (database checks run on import --dry-run)`);
    return 0;
  }

  // IMPORT
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
    const report = await importBundle(raw, { dryRun });
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
    logger.error({ err: err.message }, '💥 Bundle tool failed');
    process.exitCode = 1;
  });
