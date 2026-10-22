import { inject } from 'vitest';
import { randomUUID } from 'node:crypto';
import mongoose from '../../src/core/db/mongoose.js';
import { allModels } from '../../src/modules/models.js';

// connect this test file to its OWN database on the shared in-memory server
export async function connectTestDb() {
  const base = inject('mongoUri');
  const dbName = `test_${randomUUID().slice(0, 8)}`;
  await mongoose.connect(base, { dbName, serverSelectionTimeoutMS: 5000 });
  // build every index now so uniqueness tests are deterministic
  await Promise.all(allModels.map((Model) => Model.init()));
  return dbName;
}

export async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((el) => el.deleteMany({})));
}

export async function closeTestDb() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
}

// silent logger with the pino methods the code calls
export const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  fatal() {},
};
