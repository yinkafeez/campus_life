// Build/refresh MongoDB indexes from the schemas (production runs this instead of autoIndex).
//   npm run db:indexes
import dotenv from 'dotenv';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { createLogger } from '../src/core/logger.js';
import { connectDB, disconnectDB } from '../src/core/db/connect.js';
import { allModels } from '../src/modules/models.js';

dotenv.config({ quiet: true });

const env = parseEnv();
const logger = createLogger({ level: 'info', pretty: !env.isProduction });

try {
  await connectDB({
    uri: buildDatabaseUri(env),
    dbName: env.MONGODB_DB_NAME,
    dnsServers: env.DNS_SERVERS,
    logger,
    retries: 1,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    autoIndex: false,
  });

  for (const Model of allModels) {
    // eslint-disable-next-line no-await-in-loop -- one collection at a time keeps the log readable
    const dropped = await Model.syncIndexes();
    logger.info(
      { model: Model.modelName, dropped },
      `Indexes in sync for ${Model.collection.collectionName}`,
    );
  }
} catch (err) {
  logger.error({ err: err.message }, '💥 Index sync failed');
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
