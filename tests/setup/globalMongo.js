import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Start ONE throw-away MongoDB (single-node replica set, so transactions work like Atlas)
// for the whole test run. Tests never touch the development database.

// Prefer an installed mongod (MONGOMS_SYSTEM_BINARY, else `mongod` on PATH) — the
// fallback download is ~800 MB, far too slow for a first `npm test`.
function findSystemMongod() {
  if (process.env.MONGOMS_SYSTEM_BINARY) return process.env.MONGOMS_SYSTEM_BINARY;
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const found = execFileSync(finder, ['mongod'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((el) => el.trim())
      .find((el) => el && existsSync(el));
    return found ?? null;
  } catch {
    return null; // not installed: mongodb-memory-server downloads its own binary
  }
}

let replSet;

export async function setup({ provide }) {
  const systemBinary = findSystemMongod();
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    ...(systemBinary && { binary: { systemBinary } }),
  });
  provide('mongoUri', replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
}
