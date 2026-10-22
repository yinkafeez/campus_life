/* eslint-disable no-console, no-await-in-loop -- a command-line maintenance tool */
/*
 * DATABASE BACKUP — every collection to gzipped Extended JSON (types like ObjectId and Date
 * survive), one file per collection plus a manifest. No MongoDB tools needed.
 *
 *   npm run db:backup                                  → backups/<db>-<timestamp>/
 *   npm run db:backup -- --out D:/safe-place           → somewhere else
 *   npm run db:backup -- --allow-remote                → required for Atlas / non-local URIs
 *
 * Restore with `npm run db:restore` (see scripts/db-restore.js). Backups contain personal data
 * (emails, messages): keep them private and delete old ones (docs/OPERATIONS.md).
 */
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import dotenv from 'dotenv';
import mongoose from '../src/core/db/mongoose.js';

import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';

const { EJSON } = mongoose.mongo.BSON; // the driver's own BSON (no extra dependency)

dotenv.config({ quiet: true });
const env = parseEnv();
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : null;
};
const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(env.MONGODB_URI);
if (!isLocal && !args.includes('--allow-remote')) {
  console.error('Refusing to read a non-local database without --allow-remote.');
  process.exit(1);
}

await mongoose.connect(buildDatabaseUri(env), {
  dbName: env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
});
const db = mongoose.connection.db;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.resolve(flag('out') ?? 'backups', `${db.databaseName}-${stamp}`);
mkdirSync(dir, { recursive: true });

const manifest = {
  database: db.databaseName,
  createdAt: new Date().toISOString(),
  collections: {},
};
const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
  .map((c) => c.name)
  .filter((name) => !name.startsWith('system.'))
  .sort();

for (const name of collections) {
  const cursor = db.collection(name).find({}, { batchSize: 500 });
  let count = 0;
  async function* lines() {
    for await (const doc of cursor) {
      count += 1;
      yield `${EJSON.stringify(doc, { relaxed: false })}\n`;
    }
  }
  await pipeline(
    Readable.from(lines()),
    createGzip(),
    createWriteStream(path.join(dir, `${name}.ejson.gz`)),
  );
  const indexes = await db.collection(name).indexes();
  manifest.collections[name] = { documents: count, indexes };
  console.log(`  ${name}: ${count}`);
}
writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Backup written to ${dir}`);
await mongoose.disconnect();
