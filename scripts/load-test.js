/* eslint-disable no-console -- a command-line report */
/*
 * REALTIME LOAD TEST — N bot players join one campus zone, walk around at the client's send
 * rate and chat now and then, against a RUNNING API. Measures what players feel:
 *   - movement propagation latency (sender → other clients), p50 / p95 / p99
 *   - messages received per client per second, and in total
 *   - chat delivery, and server metrics when an admin key is given
 *
 *   node scripts/load-test.js --url http://127.0.0.1:5099 --bots 50 --seconds 20 [--zone unilag-senate-lagoon]
 *
 * Bots are created directly in a LOCAL database (refuses remote URIs) with usernames
 * "loadbot_*" and are deleted again at the end. Tokens are signed with the same
 * JWT_ACCESS_SECRET as the server under test.
 */
import dotenv from 'dotenv';
import { io } from 'socket.io-client';
import mongoose from '../src/core/db/mongoose.js';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';
import { signAccessToken } from '../src/modules/auth/auth.tokens.js';
import {
  Department,
  Faculty,
  Player,
  Programme,
  StudentRecord,
  University,
  User,
} from '../src/modules/models.js';

dotenv.config({ quiet: true });
const env = parseEnv();
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const URL = arg('url', 'http://127.0.0.1:5099');
const BOTS = Number(arg('bots', 25));
const SECONDS = Number(arg('seconds', 20));
const ZONE = arg('zone', 'unilag-senate-lagoon');
// half-width of the square the bots walk in (40 → everyone within view: the worst case)
const SPREAD = Number(arg('spread', 40));
const SEND_MS = 125; // the client's movement send rate (8 Hz)
const PREFIX = 'loadbot_';

if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(env.MONGODB_URI)) {
  console.error(
    'Refusing to create bots in a non-local database. Point MONGODB_URI at your local mongod.',
  );
  process.exit(1);
}

const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null;
// movement packets carry the send time in rotY (seconds within a 100 s window, ms precision)
const stamp = () => (Date.now() % 100_000) / 1000;
const ageMs = (rotY) => {
  let d = (Date.now() % 100_000) - Math.round(rotY * 1000);
  if (d < 0) d += 100_000;
  return d;
};

async function createBots() {
  const university = await University.findOne({ slug: 'unilag' });
  const programme = await Programme.findOne({ university: university._id, code: 'CSC' });
  const department = await Department.findById(programme.department);
  const faculty = await Faculty.findById(department.faculty);
  const bots = [];
  for (let i = 0; i < BOTS; i += 1) {
    const username = `${PREFIX}${Date.now().toString(36)}${i}`;
    // eslint-disable-next-line no-await-in-loop -- setup only
    const user = await User.create({
      email: `${username}@example.test`,
      username,
      passwordHash: 'load-test',
    });
    // eslint-disable-next-line no-await-in-loop
    const player = await Player.create({ user: user._id, displayName: `Bot ${i}` });
    // eslint-disable-next-line no-await-in-loop
    await StudentRecord.create({
      player: player._id,
      university: university._id,
      faculty: faculty._id,
      department: department._id,
      programme: programme._id,
      entryLevel: 100,
      currentLevel: 100,
      status: 'active',
      admission: { appliedAt: new Date(), reviewCompletesAt: new Date() },
    });
    bots.push({
      user,
      player,
      token: signAccessToken(env, { user, session: { _id: new mongoose.Types.ObjectId() } }),
    });
  }
  return bots;
}

async function cleanup() {
  const users = await User.find({ username: new RegExp(`^${PREFIX}`) }).select('_id');
  const players = await Player.find({
    user: mongoose.trusted({ $in: users.map((u) => u._id) }),
  }).select('_id');
  await StudentRecord.deleteMany({ player: mongoose.trusted({ $in: players.map((p) => p._id) }) });
  await Player.deleteMany({ _id: mongoose.trusted({ $in: players.map((p) => p._id) }) });
  await User.deleteMany({ _id: mongoose.trusted({ $in: users.map((u) => u._id) }) });
}

async function main() {
  await mongoose.connect(buildDatabaseUri(env), { dbName: env.MONGODB_DB_NAME });
  await cleanup();
  const bots = await createBots();
  const latencies = [];
  let received = 0;
  let chatsSent = 0;
  let chatsReceived = 0;
  let joinFailures = 0;

  const sockets = await Promise.all(
    bots.map(
      (bot) =>
        new Promise((resolve) => {
          const socket = io(URL, {
            auth: { token: bot.token },
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
          });
          const pos = {
            x: (Math.random() - 0.5) * 2 * SPREAD,
            z: (Math.random() - 0.5) * 2 * SPREAD,
          };
          const onMove = (m) => {
            received += 1;
            latencies.push(ageMs(m.rotY));
          };
          socket.on('presence:move', onMove);
          socket.on('presence:snapshot', (s) => s.players.forEach(onMove));
          socket.on('chat:message', () => {
            chatsReceived += 1;
          });
          socket.on('connect', async () => {
            const ack = await socket
              .timeout(5000)
              .emitWithAck('zone:join', { zone: ZONE, ...pos, rotY: stamp() })
              .catch(() => null);
            if (!ack?.ok) joinFailures += 1;
            resolve({ socket, pos, seq: 0 });
          });
          socket.on('connect_error', () => {
            joinFailures += 1;
            resolve({ socket, pos, seq: 0 });
          });
        }),
    ),
  );
  console.log(`connected ${sockets.length - joinFailures}/${BOTS} bots, running ${SECONDS}s…`);
  const admin = (path) =>
    process.env.LOAD_ADMIN_KEY
      ? fetch(`${URL}/api/v1/admin/realtime/metrics${path}`, {
          headers: { 'X-Admin-Key': process.env.LOAD_ADMIN_KEY },
        }).catch(() => null)
      : null;
  await admin('?reset=true'); // server metrics cover the measured window only
  latencies.length = 0;
  received = 0;
  const started = Date.now();

  const timers = sockets.map((b, i) =>
    setInterval(() => {
      // random walk at walking speed (2.2 m/s)
      const angle = Math.random() * Math.PI * 2;
      b.pos.x = Math.max(-SPREAD, Math.min(SPREAD, b.pos.x + Math.cos(angle) * 0.27));
      b.pos.z = Math.max(-SPREAD, Math.min(SPREAD, b.pos.z + Math.sin(angle) * 0.27));
      b.seq += 1;
      b.socket.emit('presence:move', {
        x: b.pos.x,
        z: b.pos.z,
        rotY: stamp(),
        anim: 'walk',
        seq: b.seq,
      });
      if (b.seq % 80 === i % 80) {
        chatsSent += 1;
        b.socket.emit(
          'chat:send',
          { text: `hello from bot ${i}`, clientId: `${i}-${b.seq}` },
          () => {},
        );
      }
    }, SEND_MS),
  );

  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  timers.forEach(clearInterval);
  const elapsed = (Date.now() - started) / 1000;

  const res = await admin('');
  const metrics = res?.ok ? (await res.json()).data.metrics : null;
  sockets.forEach((b) => b.socket.disconnect());
  latencies.sort((a, b) => a - b);
  const report = {
    bots: BOTS,
    spread: SPREAD,
    seconds: Math.round(elapsed),
    joinFailures,
    movesSentPerSecond: Math.round((BOTS * 1000) / SEND_MS),
    positionUpdatesReceived: received,
    updatesPerClientPerSecond: Math.round(received / BOTS / elapsed),
    latencyMs: {
      p50: pct(latencies, 50),
      p95: pct(latencies, 95),
      p99: pct(latencies, 99),
      max: latencies[latencies.length - 1] ?? null,
    },
    chat: { sent: chatsSent, deliveries: chatsReceived, expectedDeliveries: chatsSent * BOTS }, // zone chat: everyone, plus the sender's echo
    server: metrics,
  };
  console.log(JSON.stringify(report, null, 2));
  await cleanup();
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Load test failed:', err.message);
  await cleanup().catch(() => {});
  process.exit(1);
});
