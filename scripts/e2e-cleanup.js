/* eslint-disable no-console, no-await-in-loop -- a command-line maintenance tool */
/*
 * Remove the accounts the browser end-to-end tests create ("e2e_*" usernames), with the same
 * erasure the app uses for account deletion, then the leftover anonymised player records.
 *
 *   node scripts/e2e-cleanup.js        (LOCAL databases only — refuses anything else)
 */
import dotenv from 'dotenv';
import mongoose from '../src/core/db/mongoose.js';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { erasePlayerData } from '../src/modules/account/account.service.js';
import { Player, Session, User } from '../src/modules/models.js';

dotenv.config({ quiet: true });
const env = parseEnv();
if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(env.MONGODB_URI)) {
  console.error('Refusing: e2e cleanup only runs against a local database.');
  process.exit(1);
}

await mongoose.connect(buildDatabaseUri(env), { dbName: env.MONGODB_DB_NAME });
const users = await User.find({ username: mongoose.trusted({ $regex: '^e2e_' }) }).select('_id');
for (const user of users) {
  const player = await Player.findOne({ user: user._id });
  await erasePlayerData(player);
  if (player) await Player.collection.deleteOne({ _id: player._id });
  await Session.collection.deleteMany({ user: user._id });
  await User.collection.deleteOne({ _id: user._id });
}
console.log(`e2e cleanup: removed ${users.length} test account(s)`);
await mongoose.disconnect();
