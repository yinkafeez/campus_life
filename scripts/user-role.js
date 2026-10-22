/*
 * Change an account's role (server access = authorised).
 *   npm run user:role -- <email|username> <player|admin>
 * Non-local databases need --allow-remote.
 */
import dotenv from 'dotenv';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { createLogger } from '../src/core/logger.js';
import { connectDB, disconnectDB, maskUri } from '../src/core/db/connect.js';
import User, { USER_ROLES } from '../src/modules/auth/user.model.js';

dotenv.config({ quiet: true });

const env = parseEnv();
const logger = createLogger({ level: 'info', pretty: true });
const [identifier, role, ...flags] = process.argv.slice(2);
const isLocalUri = (uri) => /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri);

async function main() {
  if (!identifier || !USER_ROLES.includes(role)) {
    logger.error(`Usage: user-role.js <email|username> <${USER_ROLES.join('|')}> [--allow-remote]`);
    return 1;
  }
  if (!isLocalUri(env.MONGODB_URI) && !flags.includes('--allow-remote')) {
    logger.error(
      `💥 Refusing to change roles on a non-local database (${maskUri(env.MONGODB_URI)}). Re-run with --allow-remote if you are sure.`,
    );
    return 1;
  }

  await connectDB({
    uri: buildDatabaseUri(env),
    dbName: env.MONGODB_DB_NAME,
    dnsServers: env.DNS_SERVERS,
    logger,
    retries: 1,
    serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
  });
  try {
    const value = identifier.trim().toLowerCase();
    const user = await User.findOneAndUpdate(
      { $or: [{ email: value }, { username: value }] },
      { $set: { role } },
      { returnDocument: 'after' },
    );
    if (!user) {
      logger.error(`💥 No account found for "${identifier}"`);
      return 1;
    }
    logger.info(`✓ ${user.username} is now "${user.role}"`);
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
    logger.error({ err: err.message }, '💥 Role change failed');
    process.exitCode = 1;
  });
