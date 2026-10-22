import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';

/*
 * MINI-GAMES & COMPETITIONS — sessions, duels, stats/leaderboards, scheduled campus
 * competitions and achievements. Scores are computed on the server from server-held
 * secrets; rewards are paid once through the economy ledger.
 */

// per-university game content (trivia bank, reward tables) from a games pack
const gameContentSchema = new mongoose.Schema(
  {
    university: universityRef(),
    gameType: { type: String, required: true, maxlength: 40 },
    content: { type: mongoose.Schema.Types.Mixed, required: true },
    rewards: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true, minimize: false },
);
gameContentSchema.index({ university: 1, gameType: 1 }, { unique: true });

export const SESSION_MODES = ['solo', 'duel', 'competition'];

const sessionSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    university: universityRef(),
    type: { type: String, required: true, immutable: true },
    mode: { type: String, enum: SESSION_MODES, required: true, immutable: true },
    challenge: { type: mongoose.Schema.ObjectId, ref: 'Challenge', immutable: true },
    competition: { type: mongoose.Schema.ObjectId, ref: 'Competition', immutable: true },
    seed: { type: Number, required: true, immutable: true },
    secret: { type: mongoose.Schema.Types.Mixed, select: false },
    status: { type: String, enum: ['started', 'finished', 'expired'], default: 'started' },
    open: { type: Boolean }, // true while started
    startedAt: { type: Date, default: () => new Date(), immutable: true },
    expiresAt: { type: Date, required: true },
    finishedAt: Date,
    durationMs: Number,
    score: Number,
    max: Number,
    perfect: Boolean,
    details: mongoose.Schema.Types.Mixed,
    coins: { type: Number, default: 0 },
  },
  { timestamps: true },
);
sessionSchema.index({ player: 1, type: 1, open: 1 });
// one session per player per duel
sessionSchema.index(
  { challenge: 1, player: 1 },
  { unique: true, partialFilterExpression: { challenge: { $type: 'objectId' } } },
);
sessionSchema.index({ competition: 1, player: 1 });

export const CHALLENGE_STATUSES = ['waiting', 'ready', 'finished', 'declined', 'expired'];

const resultSchema = new mongoose.Schema(
  { score: Number, durationMs: Number, at: Date },
  { _id: false },
);

// a duel: same seed for both players; invited friend or quick-match
const challengeSchema = new mongoose.Schema(
  {
    university: universityRef(),
    type: { type: String, required: true, immutable: true },
    challenger: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    opponent: { type: mongoose.Schema.ObjectId, ref: 'Player' },
    open: { type: Boolean, default: false }, // waiting in the quick-match queue
    status: { type: String, enum: CHALLENGE_STATUSES, default: 'waiting' },
    seed: { type: Number, required: true, immutable: true },
    results: { challenger: resultSchema, opponent: resultSchema },
    winner: { type: mongoose.Schema.ObjectId, ref: 'Player' },
    draw: Boolean,
    expiresAt: { type: Date, required: true },
    finishedAt: Date,
  },
  { timestamps: true },
);
challengeSchema.index({ university: 1, type: 1, open: 1, status: 1 });
challengeSchema.index({ challenger: 1, status: 1 });
challengeSchema.index({ opponent: 1, status: 1 });

// per player per game type — powers leaderboards and achievements
const statSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    university: universityRef(),
    type: { type: String, required: true, immutable: true },
    played: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    best: { type: Number, default: 0 },
    perfects: { type: Number, default: 0 },
    podiums: { type: Number, default: 0 },
    rating: { type: Number, default: 1200 }, // Elo, from duels
    lastPlayedAt: Date,
  },
  { timestamps: true },
);
statSchema.index({ player: 1, type: 1 }, { unique: true });
statSchema.index({ university: 1, type: 1, best: -1 });
statSchema.index({ university: 1, type: 1, rating: -1 });
statSchema.index({ university: 1, type: 1, wins: -1 });

// a campus event: a competition window for one game type (from a schedule, or one-off)
const competitionSchema = new mongoose.Schema(
  {
    university: universityRef(),
    key: { type: String, required: true, unique: true, maxlength: 120, immutable: true }, // "<schedule>:<date>"
    schedule: { type: String, maxlength: 80 },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 400 },
    type: { type: String, required: true },
    location: { type: String, maxlength: 80 },
    teams: { type: String, enum: ['solo', 'groups'], default: 'solo' },
    teamSize: { type: Number, default: 3 }, // best N members count for a team
    maxAttempts: { type: Number, min: 1, max: 20, default: 3 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    rewards: { type: [{ rank: Number, coins: Number, _id: false }], default: [] },
    status: { type: String, enum: ['scheduled', 'finalized'], default: 'scheduled' },
    finalizedAt: Date,
    standings: mongoose.Schema.Types.Mixed, // snapshot taken when finalized
  },
  { timestamps: true },
);
competitionSchema.index({ university: 1, startsAt: 1 });

const entrySchema = new mongoose.Schema(
  {
    competition: {
      type: mongoose.Schema.ObjectId,
      ref: 'Competition',
      required: true,
      immutable: true,
    },
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    group: { type: mongoose.Schema.ObjectId, ref: 'CommunityGroup', immutable: true },
    best: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    bestAt: Date,
  },
  { timestamps: true },
);
entrySchema.index({ competition: 1, player: 1 }, { unique: true });
entrySchema.index({ competition: 1, best: -1 });

// recurring or one-off campus events (from the games pack)
const scheduleSchema = new mongoose.Schema(
  {
    university: universityRef(),
    key: { type: String, required: true, maxlength: 80 },
    title: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 400 },
    type: { type: String, required: true },
    location: { type: String, maxlength: 80 },
    teams: { type: String, enum: ['solo', 'groups'], default: 'solo' },
    teamSize: { type: Number, default: 3 },
    maxAttempts: { type: Number, default: 3 },
    recurrence: { type: mongoose.Schema.Types.Mixed, required: true }, // { type:'weekly', days, start, durationMinutes } | { type:'once', startsAt, endsAt }
    rewards: { type: [{ rank: Number, coins: Number, _id: false }], default: [] },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
  },
  { timestamps: true, minimize: false },
);
scheduleSchema.index({ university: 1, key: 1 }, { unique: true });

export const GAME_ACHIEVEMENT_CRITERIA = [
  'games-played',
  'duel-wins',
  'perfect-games',
  'competition-podiums',
];

const gameAchievementSchema = new mongoose.Schema(
  {
    university: universityRef(),
    key: { type: String, required: true, maxlength: 80 },
    title: { type: String, required: true, maxlength: 80 },
    description: { type: String, maxlength: 300 },
    criteria: {
      type: { type: String, enum: GAME_ACHIEVEMENT_CRITERIA, required: true },
      count: { type: Number, required: true, min: 1 },
    },
  },
  { timestamps: true },
);
gameAchievementSchema.index({ university: 1, key: 1 }, { unique: true });

const gameAwardSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    university: universityRef(),
    key: { type: String, required: true, immutable: true },
    awardedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);
gameAwardSchema.index({ player: 1, university: 1, key: 1 }, { unique: true });

export const GameContent = mongoose.model('GameContent', gameContentSchema);
export const GameSession = mongoose.model('GameSession', sessionSchema);
export const Challenge = mongoose.model('Challenge', challengeSchema);
export const GameStat = mongoose.model('GameStat', statSchema);
export const Competition = mongoose.model('Competition', competitionSchema);
export const CompetitionEntry = mongoose.model('CompetitionEntry', entrySchema);
export const EventSchedule = mongoose.model('EventSchedule', scheduleSchema);
export const GameAchievement = mongoose.model('GameAchievement', gameAchievementSchema);
export const GameAward = mongoose.model('GameAward', gameAwardSchema);
