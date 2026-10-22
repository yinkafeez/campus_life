/* eslint-disable no-console, no-await-in-loop -- a command-line maintenance tool */
/*
 * DATABASE RESTORE from a db-backup.js folder into the database in MONGODB_URI/MONGODB_DB_NAME.
 *
 *   npm run db:restore -- backups/campus_life-2026-…            (target must be EMPTY)
 *   npm run db:restore -- <folder> --drop                        (replace the collections)
 *   npm run db:restore -- <folder> --allow-remote                (Atlas / non-local target)
 *
 * Safe by default: refuses a non-empty target unless --drop, and remote targets unless
 * --allow-remote. Indexes are recreated from the manifest after the data.
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import dotenv from 'dotenv';
import mongoose from '../src/core/db/mongoose.js';

import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';

const { EJSON } = mongoose.mongo.BSON; // the driver's own BSON (no extra dependency)

dotenv.config({ quiet: true });
const env = parseEnv();
const [folder, ...rest] = process.argv.slice(2);
if (!folder || !existsSync(path.join(folder, 'manifest.json'))) {
  console.error(
    'Usage: npm run db:restore -- <backup folder with manifest.json> [--drop] [--allow-remote]',
  );
  process.exit(1);
}
const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(env.MONGODB_URI);
if (!isLocal && !rest.includes('--allow-remote')) {
  console.error('Refusing to write to a non-local database without --allow-remote.');
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(path.join(folder, 'manifest.json'), 'utf8'));

await mongoose.connect(buildDatabaseUri(env), {
  dbName: env.MONGODB_DB_NAME,
  serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
});
const db = mongoose.connection.db;
const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
const clash = Object.keys(manifest.collections).filter((name) => existing.includes(name));
if (clash.length && !rest.includes('--drop')) {
  console.error(
    `Target ${db.databaseName} already has ${clash.length} of these collections. Re-run with --drop to replace them.`,
  );
  process.exit(1);
}

for (const [name, info] of Object.entries(manifest.collections)) {
  if (clash.includes(name)) await db.collection(name).drop();
  const collection = db.collection(name);
  const lines = createInterface({
    input: createReadStream(path.join(folder, `${name}.ejson.gz`)).pipe(createGunzip()),
  });
  let batch = [];
  let restored = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    batch.push(EJSON.parse(line, { relaxed: false }));
    if (batch.length === 500) {
      await collection.insertMany(batch, { ordered: false });
      restored += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await collection.insertMany(batch, { ordered: false });
    restored += batch.length;
  }
  for (const index of info.indexes.filter((i) => i.name !== '_id_')) {
    const { key, name: indexName, v, ns, ...options } = index;
    await collection.createIndex(key, { name: indexName, ...options });
  }
  console.log(`  ${name}: ${restored}/${info.documents}`);
}
console.log(
  `Restored ${Object.keys(manifest.collections).length} collections into ${db.databaseName}`,
);
await mongoose.disconnect();
