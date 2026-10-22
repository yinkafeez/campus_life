import { randomInt } from 'node:crypto';
import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { bus, EVENTS } from '../../core/events.js';
import Player from '../players/player.model.js';
import User from '../auth/user.model.js';
import { CommunityGroup } from '../community/community.models.js';
import { universityOfPlayer } from '../campus/campus.service.js';
import { areFriends, blockedEitherWay, hiddenPlayerIds } from '../social/social.service.js';
import { seededRandom } from '../learning/engines/shared.js';
import { LedgerEntry } from '../economy/economy.models.js';
import { economySettings } from '../economy/economy.service.js';
import { postOnce } from '../economy/ledger.js';
import { GAME_TYPES, PLANNED_TYPES, getGameType } from './types/index.js';
import { occurrences } from './schedule.js';
import {
  Challenge,
  Competition,
  CompetitionEntry,
  EventSchedule,
  GameAchievement,
  GameAward,
  GameContent,
  GameSession,
  GameStat,
} from './games.models.js';

/*
 * GAMES — sessions, duels, leaderboards, campus competitions and achievements.
 * The server creates every game from a secret seed, measures the time itself, scores the
 * answer, and pays rewards once (ledger idempotency keys). Coin rewards from casual play are
 * capped per day; competition prizes come from the game, never from other players (no stakes).
 */
const trusted = (q) => mongoose.trusted(q);
const GRACE_MS = 10_000;
const CHALLENGE_HOURS = 24;
const ELO_K = 32;

async function gamesContext(player) {
  const university = await universityOfPlayer(player._id);
  if (!university)
    throw new AppError('Get admitted to a university to join campus games.', 409, 'NOT_ENROLLED');
  return { university };
}

async function contentFor(university, type) {
  const doc = await GameContent.findOne({ university: university._id, gameType: type });
  if (!doc)
    throw new AppError('This game is not available at your university yet.', 409, 'GAME_NOT_READY');
  return doc;
}

const namesFor = async (playerIds) => {
  const players = await Player.find({ _id: trusted({ $in: playerIds }) }).select(
    'displayName user',
  );
  const users = await User.find({ _id: trusted({ $in: players.map((p) => p.user) }) }).select(
    'username',
  );
  const usernames = new Map(users.map((u) => [String(u._id), u.username]));
  return new Map(
    players.map((p) => [
      String(p._id),
      { playerId: p._id, displayName: p.displayName, username: usernames.get(String(p.user)) },
    ]),
  );
};

// ─── Catalogue & stats ────────────────────────────────────────────────────
export async function listGames(player) {
  const { university } = await gamesContext(player);
  const [contents, stats] = await Promise.all([
    GameContent.find({ university: university._id }).select('gameType'),
    GameStat.find({ player: player._id }),
  ]);
  const available = new Set(contents.map((c) => c.gameType));
  const mine = new Map(stats.map((s) => [s.type, s]));
  const playable = Object.values(GAME_TYPES).map((t) => ({
    key: t.key,
    name: t.name,
    sport: t.sport,
    scope: t.scope,
    modes: t.modes,
    implemented: true,
    available: available.has(t.key),
    stats: mine.has(t.key) ? presentStat(mine.get(t.key)) : null,
  }));
  return [...playable, ...PLANNED_TYPES.map((p) => ({ ...p, available: false, stats: null }))];
}

const presentStat = (s) => ({
  played: s.played,
  wins: s.wins,
  losses: s.losses,
  draws: s.draws,
  best: s.best,
  rating: s.rating,
  perfects: s.perfects,
});

// ─── Sessions ─────────────────────────────────────────────────────────────
async function createSession(
  player,
  university,
  type,
  { mode, challenge, competition, seed = randomInt(1, 2 ** 31 - 1) },
) {
  const game = getGameType(type);
  const content = await contentFor(university, type);
  const { secret, view, timeLimitSeconds } = game.create(seededRandom(seed), content.content);
  const session = await GameSession.create({
    player: player._id,
    university: university._id,
    type,
    mode,
    challenge: challenge?._id,
    competition: competition?._id,
    seed,
    secret,
    open: true,
    expiresAt: new Date(Date.now() + timeLimitSeconds * 1000 + GRACE_MS),
  });
  return { session: presentSession(session), view, timeLimitSeconds };
}

const presentSession = (s) => ({
  id: s._id,
  type: s.type,
  mode: s.mode,
  status: s.status,
  challenge: s.challenge ?? null,
  competition: s.competition ?? null,
  startedAt: s.startedAt,
  expiresAt: s.expiresAt,
  score: s.score ?? null,
  max: s.max ?? null,
  coins: s.coins ?? 0,
});

export async function startSolo(player, type) {
  const { university } = await gamesContext(player);
  if (!getGameType(type)) throw AppError.notFound('Unknown game.');
  // finish (expire) any stale solo game of this type so they can't pile up
  await GameSession.updateMany(
    { player: player._id, type, mode: 'solo', open: true },
    { $set: { status: 'expired' }, $unset: { open: 1 } },
  );
  return createSession(player, university, type, { mode: 'solo' });
}

/** The view of a running session (rebuilt from its seed — identical to the first time). */
export async function getSession(player, sessionId) {
  const session = await GameSession.findOne({ _id: sessionId, player: player._id });
  if (!session) throw AppError.notFound('Game not found.');
  const content = await contentFor({ _id: session.university }, session.type);
  const { view, timeLimitSeconds } = getGameType(session.type).create(
    seededRandom(session.seed),
    content.content,
  );
  return {
    session: presentSession(session),
    view: session.open ? view : null,
    timeLimitSeconds,
    details: session.open ? null : session.details,
  };
}

async function coinsPaidToday(playerId) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rows = await LedgerEntry.aggregate([
    { $match: { player: playerId, kind: 'prize', 'ref.type': 'game', createdAt: { $gte: start } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows[0]?.total ?? 0;
}

/** Pay a capped casual-play reward once. Returns the coins actually paid. */
async function payGameCoins(player, amount, { idempotencyKey, description, refId }) {
  if (amount <= 0) return 0;
  const { rules } = await economySettings();
  const room = Math.max(0, rules.dailyGamePrizeCap - (await coinsPaidToday(player._id)));
  const coins = Math.min(amount, room);
  if (!coins) return 0;
  const { duplicate, entry } = await postOnce({
    player: player._id,
    amount: coins,
    kind: 'prize',
    category: 'income',
    description,
    idempotencyKey,
    ref: { type: 'game', id: String(refId) },
  });
  return duplicate ? entry.amount : coins;
}

export async function submitSession(player, sessionId, rawAnswer) {
  const session = await GameSession.findOne({ _id: sessionId, player: player._id }).select(
    '+secret',
  );
  if (!session) throw AppError.notFound('Game not found.');
  if (!session.open) throw new AppError('This game is already over.', 409, 'GAME_CLOSED');
  const now = new Date();
  if (now > session.expiresAt) {
    await GameSession.updateOne(
      { _id: session._id, open: true },
      { $set: { status: 'expired' }, $unset: { open: 1 } },
    );
    throw new AppError('Time ran out for this game.', 409, 'GAME_EXPIRED');
  }
  const game = getGameType(session.type);
  const parsed = game.answerSchema.safeParse(rawAnswer);
  if (!parsed.success)
    throw AppError.validation(
      parsed.error.issues.map((el) => ({
        path: ['answer', ...el.path].join('.'),
        message: el.message,
      })),
    );
  const content = await contentFor({ _id: session.university }, session.type);
  const durationMs = now - session.startedAt; // measured by the server
  const { score, max, perfect, details, ...extra } = game.score({
    secret: session.secret,
    answer: parsed.data,
    content: content.content,
    durationMs,
  });

  // close exactly once
  const closed = await GameSession.findOneAndUpdate(
    { _id: session._id, open: true },
    {
      $set: {
        status: 'finished',
        finishedAt: now,
        durationMs,
        score,
        max,
        perfect,
        details: { ...extra, items: details },
      },
      $unset: { open: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!closed) throw new AppError('This game is already over.', 409, 'GAME_CLOSED');

  await GameStat.updateOne(
    { player: player._id, type: session.type },
    {
      $setOnInsert: { player: player._id, university: session.university, type: session.type },
      $inc: { played: 1, perfects: perfect ? 1 : 0 },
      $max: { best: score },
      $set: { lastPlayedAt: now },
    },
    { upsert: true },
  );

  // casual solo rewards (capped per day); competitions pay at the end; duels pay the winner
  let coins = 0;
  if (session.mode === 'solo') {
    const r = content.rewards?.solo ?? {};
    const amount = r.perPoints ? Math.floor(score / r.perPoints) : (r.perGoal ?? 0) * score;
    coins = await payGameCoins(player, amount, {
      idempotencyKey: `game:${session._id}`,
      description: `${game.name}: ${score} points`,
      refId: session._id,
    });
    if (coins) await GameSession.updateOne({ _id: session._id }, { $set: { coins } });
  }

  let duel = null;
  if (session.mode === 'duel') duel = await recordDuelResult(session, closed);
  if (session.mode === 'competition') await recordCompetitionScore(session, closed);

  const achievements = await evaluateAchievements(player, session.university);
  return {
    session: { ...presentSession(closed), coins },
    result: { score, max, perfect, durationMs, ...extra, details },
    duel,
    achievementsEarned: achievements,
  };
}

// ─── Duels ────────────────────────────────────────────────────────────────
const presentChallenge = (c, names, me) => {
  const mine = String(c.challenger) === String(me) ? 'challenger' : 'opponent';
  const theirs = mine === 'challenger' ? 'opponent' : 'challenger';
  return {
    id: c._id,
    type: c.type,
    status: c.status,
    role: mine, // am I the challenger or the opponent?
    quickMatch: c.open || (!c.opponent && c.status === 'waiting'),
    challenger: names.get(String(c.challenger)) ?? null,
    opponent: c.opponent ? (names.get(String(c.opponent)) ?? null) : null,
    myResult: c.results?.[mine]?.score ?? null,
    // the opponent's score stays hidden until both have played
    theirResult: c.status === 'finished' ? (c.results?.[theirs]?.score ?? null) : null,
    winner: c.winner ? (names.get(String(c.winner)) ?? null) : null,
    draw: Boolean(c.draw),
    youWon: c.winner ? String(c.winner) === String(me) : null,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
  };
};

/** Invite a friend, or quick-match with anyone at your university waiting for the same game. */
export async function createChallenge(player, { type, opponentId }) {
  const { university } = await gamesContext(player);
  if (!getGameType(type)) throw AppError.notFound('Unknown game.');
  await contentFor(university, type);
  const expiresAt = new Date(Date.now() + CHALLENGE_HOURS * 3_600_000);

  if (opponentId) {
    if (String(opponentId) === String(player._id))
      throw AppError.badRequest("You can't challenge yourself.");
    const opponent = await Player.findById(opponentId);
    if (
      !opponent ||
      (await blockedEitherWay(player._id, opponent._id)) ||
      !(await areFriends(player._id, opponent._id))
    ) {
      throw new AppError('You can only challenge your friends.', 403, 'CHALLENGE_NOT_ALLOWED');
    }
    const challenge = await Challenge.create({
      university: university._id,
      type,
      challenger: player._id,
      opponent: opponent._id,
      seed: randomInt(1, 2 ** 31 - 1),
      expiresAt,
    });
    bus.emit(EVENTS.CHALLENGE_SENT, {
      toPlayerId: String(opponent._id),
      challengeId: String(challenge._id),
      type,
      from: { playerId: String(player._id), displayName: player.displayName },
    });
    return {
      challenge: presentChallenge(
        challenge,
        await namesFor([player._id, opponent._id]),
        player._id,
      ),
      matched: false,
    };
  }

  // QUICK MATCH: join someone else's open challenge atomically, or open one
  const hidden = await hiddenPlayerIds(player._id);
  const joined = await Challenge.findOneAndUpdate(
    {
      university: university._id,
      type,
      open: true,
      status: 'waiting',
      challenger: trusted({
        $nin: [player._id, ...[...hidden].map((id) => new mongoose.Types.ObjectId(id))],
      }),
      expiresAt: trusted({ $gt: new Date() }),
    },
    { $set: { opponent: player._id, open: false, status: 'ready' } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
  if (joined) {
    bus.emit(EVENTS.CHALLENGE_SENT, {
      toPlayerId: String(joined.challenger),
      challengeId: String(joined._id),
      type,
      matched: true,
      from: { playerId: String(player._id), displayName: player.displayName },
    });
    return {
      challenge: presentChallenge(
        joined,
        await namesFor([joined.challenger, player._id]),
        player._id,
      ),
      matched: true,
    };
  }
  const mineOpen = await Challenge.findOne({
    challenger: player._id,
    type,
    open: true,
    status: 'waiting',
    expiresAt: trusted({ $gt: new Date() }),
  });
  const challenge =
    mineOpen ??
    (await Challenge.create({
      university: university._id,
      type,
      challenger: player._id,
      open: true,
      seed: randomInt(1, 2 ** 31 - 1),
      expiresAt,
    }));
  return {
    challenge: presentChallenge(challenge, await namesFor([player._id]), player._id),
    matched: false,
  };
}

export async function listChallenges(player) {
  await Challenge.updateMany(
    {
      $or: [{ challenger: player._id }, { opponent: player._id }],
      status: trusted({ $in: ['waiting', 'ready'] }),
      expiresAt: trusted({ $lte: new Date() }),
    },
    { $set: { status: 'expired', open: false } },
  );
  const challenges = await Challenge.find({
    $or: [{ challenger: player._id }, { opponent: player._id }],
  })
    .sort({ updatedAt: -1 })
    .limit(30);
  const names = await namesFor([
    ...new Set(challenges.flatMap((c) => [c.challenger, c.opponent].filter(Boolean).map(String))),
  ]);
  return challenges.map((c) => presentChallenge(c, names, player._id));
}

export async function respondToChallenge(player, challengeId, accept) {
  const challenge = await Challenge.findOneAndUpdate(
    { _id: challengeId, opponent: player._id, status: 'waiting', open: false },
    { $set: { status: accept ? 'ready' : 'declined' } },
    { returnDocument: 'after' },
  );
  if (!challenge) throw AppError.notFound('No pending challenge with that id.');
  return presentChallenge(
    challenge,
    await namesFor([challenge.challenger, challenge.opponent]),
    player._id,
  );
}

/** Play your side of a duel (same seed for both players). */
export async function playChallenge(player, challengeId) {
  const challenge = await Challenge.findOne({
    _id: challengeId,
    $or: [{ challenger: player._id }, { opponent: player._id }],
  });
  if (!challenge) throw AppError.notFound('Challenge not found.');
  if (!['waiting', 'ready'].includes(challenge.status) || challenge.expiresAt <= new Date()) {
    throw new AppError('This challenge is no longer open.', 409, 'CHALLENGE_CLOSED');
  }
  const isChallenger = String(challenge.challenger) === String(player._id);
  if (!isChallenger && challenge.status !== 'ready')
    throw new AppError('Accept the challenge first.', 409, 'CHALLENGE_NOT_ACCEPTED');
  const existing = await GameSession.findOne({ challenge: challenge._id, player: player._id });
  if (existing) {
    if (!existing.open) throw new AppError('You already played this duel.', 409, 'ALREADY_PLAYED');
    return getSession(player, existing._id);
  }
  const { university } = await gamesContext(player);
  try {
    return await createSession(player, university, challenge.type, {
      mode: 'duel',
      challenge,
      seed: challenge.seed,
    });
  } catch (err) {
    if (err.code === 11000)
      throw new AppError('You already played this duel.', 409, 'ALREADY_PLAYED');
    throw err;
  }
}

const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

async function recordDuelResult(session, closed) {
  const challenge = await Challenge.findById(session.challenge);
  const side = String(challenge.challenger) === String(session.player) ? 'challenger' : 'opponent';
  const updated = await Challenge.findOneAndUpdate(
    { _id: challenge._id, [`results.${side}`]: trusted({ $exists: false }) },
    {
      $set: {
        [`results.${side}`]: {
          score: closed.score,
          durationMs: closed.durationMs,
          at: closed.finishedAt,
        },
      },
    },
    { returnDocument: 'after' },
  );
  if (!updated?.results?.challenger || !updated?.results?.opponent || !updated.opponent)
    return { waiting: true };

  // both sides in: finish exactly once
  const a = updated.results.challenger;
  const b = updated.results.opponent;
  const draw = a.score === b.score;
  const winner = draw ? null : a.score > b.score ? updated.challenger : updated.opponent;
  const finished = await Challenge.findOneAndUpdate(
    { _id: updated._id, status: trusted({ $in: ['waiting', 'ready'] }) },
    { $set: { status: 'finished', winner, draw, finishedAt: new Date(), open: false } },
    { returnDocument: 'after' },
  );
  if (!finished) return { waiting: false };

  // Elo + win/loss counts
  const [statA, statB] = await Promise.all([
    GameStat.findOne({ player: finished.challenger, type: finished.type }),
    GameStat.findOne({ player: finished.opponent, type: finished.type }),
  ]);
  const ra = statA?.rating ?? 1200;
  const rb = statB?.rating ?? 1200;
  const sa = draw ? 0.5 : String(winner) === String(finished.challenger) ? 1 : 0;
  const deltaA = Math.round(ELO_K * (sa - expected(ra, rb)));
  const outcome = (s) => (s === 1 ? { wins: 1 } : s === 0 ? { losses: 1 } : { draws: 1 });
  await Promise.all([
    GameStat.updateOne(
      { player: finished.challenger, type: finished.type },
      { $inc: { rating: deltaA, ...outcome(sa) } },
    ),
    GameStat.updateOne(
      { player: finished.opponent, type: finished.type },
      { $inc: { rating: -deltaA, ...outcome(1 - sa) } },
    ),
  ]);

  const content = await GameContent.findOne({
    university: finished.university,
    gameType: finished.type,
  });
  const rewards = content?.rewards ?? {};
  const pay = async (playerId, amount, label) => {
    const p = await Player.findById(playerId);
    return payGameCoins(p, amount, {
      idempotencyKey: `duel:${finished._id}:${playerId}`,
      description: label,
      refId: finished._id,
    });
  };
  if (draw) {
    await pay(finished.challenger, rewards.duelDraw ?? 0, `${finished.type} duel: draw`);
    await pay(finished.opponent, rewards.duelDraw ?? 0, `${finished.type} duel: draw`);
  } else {
    await pay(winner, rewards.duelWin ?? 0, `${finished.type} duel: win`);
  }
  [finished.challenger, finished.opponent].forEach((id) =>
    bus.emit(EVENTS.CHALLENGE_FINISHED, {
      toPlayerId: String(id),
      challengeId: String(finished._id),
      type: finished.type,
      draw,
      won: !draw && String(winner) === String(id),
    }),
  );
  await Promise.all([
    evaluateAchievements({ _id: finished.challenger }, finished.university),
    evaluateAchievements({ _id: finished.opponent }, finished.university),
  ]);
  return { waiting: false, draw, youWon: !draw && String(winner) === String(session.player) };
}

// ─── Leaderboards ─────────────────────────────────────────────────────────
const METRICS = { best: 'best', rating: 'rating', wins: 'wins' };

export async function leaderboard(player, type, metric = 'best') {
  const { university } = await gamesContext(player);
  if (!getGameType(type)) throw AppError.notFound('Unknown game.');
  const field = METRICS[metric];
  const top = await GameStat.find({ university: university._id, type, played: trusted({ $gt: 0 }) })
    .sort({ [field]: -1, updatedAt: 1 })
    .limit(20);
  const names = await namesFor(top.map((s) => s.player));
  const mine = await GameStat.findOne({ player: player._id, type });
  const myRank = mine
    ? (await GameStat.countDocuments({
        university: university._id,
        type,
        [field]: trusted({ $gt: mine[field] }),
      })) + 1
    : null;
  return {
    type,
    metric,
    entries: top.map((s, i) => ({
      rank: i + 1,
      ...names.get(String(s.player)),
      value: s[field],
      played: s.played,
    })),
    me: mine ? { rank: myRank, value: mine[field] } : null,
  };
}

// ─── Competitions (scheduled campus events) ───────────────────────────────
async function materializeCompetitions(university) {
  const schedules = await EventSchedule.find({ university: university._id, status: 'active' });
  const timeZone = university.timezone ?? 'Africa/Lagos';
  /* eslint-disable no-await-in-loop -- a handful of upserts */
  for (const s of schedules) {
    for (const occ of occurrences(s, timeZone)) {
      await Competition.updateOne(
        { key: `${university.slug}:${occ.key}` },
        {
          $setOnInsert: {
            university: university._id,
            key: `${university.slug}:${occ.key}`,
            schedule: s.key,
            title: s.title,
            description: s.description,
            type: s.type,
            location: s.location,
            teams: s.teams,
            teamSize: s.teamSize,
            maxAttempts: s.maxAttempts,
            startsAt: occ.startsAt,
            endsAt: occ.endsAt,
            rewards: s.rewards,
          },
        },
        { upsert: true },
      ).catch((err) => {
        if (err.code !== 11000) throw err;
      });
    }
  }
  /* eslint-enable no-await-in-loop */
}

const phase = (c, now = new Date()) =>
  c.status === 'finalized'
    ? 'finished'
    : now < c.startsAt
      ? 'upcoming'
      : now <= c.endsAt
        ? 'live'
        : 'ended';

async function standings(competition, limit = 10) {
  const entries = await CompetitionEntry.find({
    competition: competition._id,
    best: trusted({ $gt: 0 }),
  }).sort({ best: -1, bestAt: 1 });
  if (competition.teams === 'groups') {
    const byGroup = new Map();
    entries.forEach((e) => {
      if (!e.group) return;
      const list = byGroup.get(String(e.group)) ?? [];
      list.push(e);
      byGroup.set(String(e.group), list);
    });
    const groups = await CommunityGroup.find({ _id: trusted({ $in: [...byGroup.keys()] }) }).select(
      'name',
    );
    const names = new Map(groups.map((g) => [String(g._id), g.name]));
    return [...byGroup.entries()]
      .map(([groupId, list]) => ({
        groupId,
        name: names.get(groupId) ?? 'Group',
        score: list.slice(0, competition.teamSize).reduce((sum, e) => sum + e.best, 0),
        members: list.map((e) => String(e.player)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row, i) => ({ rank: i + 1, ...row }));
  }
  const names = await namesFor(entries.slice(0, limit).map((e) => e.player));
  return entries
    .slice(0, limit)
    .map((e, i) => ({ rank: i + 1, ...names.get(String(e.player)), score: e.best }));
}

/** Close an ended competition ONCE and pay its prizes (idempotent per player). */
async function finalizeIfEnded(competition) {
  if (competition.status === 'finalized' || new Date() <= competition.endsAt) return competition;
  const table = await standings(competition, 50);
  const claimed = await Competition.findOneAndUpdate(
    { _id: competition._id, status: 'scheduled' },
    { $set: { status: 'finalized', finalizedAt: new Date(), standings: table.slice(0, 10) } },
    { returnDocument: 'after' },
  );
  if (!claimed) return Competition.findById(competition._id);

  const prize = new Map(claimed.rewards.map((r) => [r.rank, r.coins]));
  const winners =
    claimed.teams === 'groups'
      ? table.flatMap((row) =>
          prize.has(row.rank) ? row.members.map((playerId) => ({ playerId, rank: row.rank })) : [],
        )
      : table
          .filter((row) => prize.has(row.rank))
          .map((row) => ({ playerId: String(row.playerId), rank: row.rank }));
  /* eslint-disable no-await-in-loop -- few winners, each an idempotent ledger post */
  for (const { playerId, rank } of winners) {
    await postOnce({
      player: new mongoose.Types.ObjectId(playerId),
      amount: prize.get(rank),
      kind: 'prize',
      category: 'income',
      description: `${claimed.title}: rank ${rank}`,
      idempotencyKey: `competition:${claimed._id}:${playerId}`,
      ref: { type: 'competition', id: String(claimed._id) },
    });
    if (rank <= 3)
      await GameStat.updateOne({ player: playerId, type: claimed.type }, { $inc: { podiums: 1 } });
    await evaluateAchievements({ _id: new mongoose.Types.ObjectId(playerId) }, claimed.university);
  }
  /* eslint-enable no-await-in-loop */
  return claimed;
}

async function presentCompetition(c, player) {
  const [entry, table] = await Promise.all([
    CompetitionEntry.findOne({ competition: c._id, player: player._id }),
    standings(c, 10),
  ]);
  return {
    id: c._id,
    key: c.key,
    title: c.title,
    description: c.description ?? null,
    type: c.type,
    location: c.location ?? null,
    teams: c.teams,
    teamSize: c.teamSize,
    maxAttempts: c.maxAttempts,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    phase: phase(c),
    rewards: c.rewards,
    myEntry: entry
      ? { best: entry.best, attempts: entry.attempts, group: entry.group ?? null }
      : null,
    standings: c.status === 'finalized' && c.standings ? c.standings : table,
  };
}

export async function listCompetitions(player) {
  const { university } = await gamesContext(player);
  await materializeCompetitions(university);
  const since = new Date(Date.now() - 3 * 86_400_000);
  const until = new Date(Date.now() + 7 * 86_400_000);
  let comps = await Competition.find({
    university: university._id,
    endsAt: trusted({ $gte: since }),
    startsAt: trusted({ $lte: until }),
  }).sort({ startsAt: 1 });
  comps = await Promise.all(comps.map(finalizeIfEnded));
  return Promise.all(comps.map((c) => presentCompetition(c, player)));
}

export async function getCompetition(player, id) {
  const { university } = await gamesContext(player);
  const c = await Competition.findOne({ _id: id, university: university._id });
  if (!c) throw AppError.notFound('Competition not found.');
  return presentCompetition(await finalizeIfEnded(c), player);
}

/** Enter (and for team events, pick your group). */
export async function enterCompetition(player, id, { groupId } = {}) {
  const { university } = await gamesContext(player);
  const c = await Competition.findOne({ _id: id, university: university._id });
  if (!c) throw AppError.notFound('Competition not found.');
  if (phase(c) === 'ended' || phase(c) === 'finished')
    throw new AppError('This competition is over.', 409, 'COMPETITION_CLOSED');
  let group;
  if (c.teams === 'groups') {
    if (!groupId) throw AppError.badRequest('Choose the group you are playing for.');
    group = await CommunityGroup.findOne({
      _id: groupId,
      university: university._id,
      'members.player': player._id,
    });
    if (!group) throw AppError.forbidden('You can only play for a group you belong to.');
  }
  await CompetitionEntry.updateOne(
    { competition: c._id, player: player._id },
    { $setOnInsert: { competition: c._id, player: player._id, group: group?._id } },
    { upsert: true },
  ).catch((err) => {
    if (err.code !== 11000) throw err;
  });
  return presentCompetition(c, player);
}

export async function playCompetition(player, id) {
  const { university } = await gamesContext(player);
  const c = await Competition.findOne({ _id: id, university: university._id });
  if (!c) throw AppError.notFound('Competition not found.');
  if (phase(c) !== 'live')
    throw new AppError(
      phase(c) === 'upcoming'
        ? 'This competition has not started yet.'
        : 'This competition is over.',
      409,
      'COMPETITION_CLOSED',
    );
  if (c.teams === 'solo') await enterCompetition(player, id);
  // count the attempt atomically before handing out a game (so attempts can't be exceeded)
  const entry = await CompetitionEntry.findOneAndUpdate(
    { competition: c._id, player: player._id, attempts: trusted({ $lt: c.maxAttempts }) },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  );
  if (!entry) {
    const exists = await CompetitionEntry.exists({ competition: c._id, player: player._id });
    throw new AppError(
      exists ? 'No attempts left in this competition.' : 'Enter the competition first.',
      409,
      exists ? 'NO_ATTEMPTS_LEFT' : 'NOT_ENTERED',
    );
  }
  return createSession(player, university, c.type, { mode: 'competition', competition: c });
}

async function recordCompetitionScore(session, closed) {
  const c = await Competition.findById(session.competition);
  // only games STARTED inside the window count (a game started before the end may finish just after)
  if (!c || session.startedAt < c.startsAt || session.startedAt > c.endsAt) return;
  await CompetitionEntry.updateOne(
    { competition: c._id, player: session.player, best: trusted({ $lt: closed.score }) },
    { $set: { best: closed.score, bestAt: closed.finishedAt } },
  );
}

// ─── Achievements ─────────────────────────────────────────────────────────
async function evaluateAchievements(player, universityId) {
  const [defs, stats, awards] = await Promise.all([
    GameAchievement.find({ university: universityId }),
    GameStat.find({ player: player._id }),
    GameAward.find({ player: player._id, university: universityId }).select('key'),
  ]);
  const have = new Set(awards.map((a) => a.key));
  const sum = (f) => stats.reduce((n, s) => n + (s[f] ?? 0), 0);
  const counts = {
    'games-played': sum('played'),
    'duel-wins': sum('wins'),
    'perfect-games': sum('perfects'),
    'competition-podiums': sum('podiums'),
  };
  const earned = [];
  /* eslint-disable no-await-in-loop -- guarded inserts */
  for (const def of defs) {
    if (have.has(def.key) || counts[def.criteria.type] < def.criteria.count) continue;
    try {
      await GameAward.create({ player: player._id, university: universityId, key: def.key });
      earned.push({ key: def.key, title: def.title, description: def.description ?? null });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  /* eslint-enable no-await-in-loop */
  return earned;
}

export async function listGameAchievements(player) {
  const { university } = await gamesContext(player);
  const [defs, awards] = await Promise.all([
    GameAchievement.find({ university: university._id }).sort({ 'criteria.count': 1 }),
    GameAward.find({ player: player._id }),
  ]);
  const at = new Map(awards.map((a) => [a.key, a.awardedAt]));
  return defs.map((d) => ({
    key: d.key,
    title: d.title,
    description: d.description ?? null,
    criteria: d.criteria,
    earned: at.has(d.key),
    awardedAt: at.get(d.key) ?? null,
  }));
}
