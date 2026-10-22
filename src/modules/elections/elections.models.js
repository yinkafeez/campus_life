import { randomUUID } from 'node:crypto';
import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';

/*
 * STUDENT ELECTIONS (game) — elections, candidacies, campaigns, ballots, results, disputes,
 * leadership assignments, leader actions and an append-only audit log.
 *
 * Voter privacy: a VoteReceipt records THAT a player voted (one per election, unique index);
 * the Vote documents record WHAT was chosen with no voter id and no timestamp (random
 * string ids, so even the _id can't reveal when a vote was cast). Only the voter holds the
 * ballot code that links them to their ballot.
 */
export const ELECTION_SCOPES = ['university', 'faculty', 'department', 'hall'];
export const ELECTION_STATES = [
  'scheduled',
  'nominations',
  'campaign',
  'voting',
  'counting',
  'disputed',
  'certified',
  'cancelled',
  'void',
];

const scopeSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ELECTION_SCOPES, required: true },
    unit: { type: mongoose.Schema.ObjectId }, // Faculty / Department / Hostel id (none for university)
    unitName: { type: String, maxlength: 160 },
  },
  { _id: false },
);

const electionSchema = new mongoose.Schema(
  {
    university: universityRef(),
    cycle: { type: String, required: true, maxlength: 60, immutable: true }, // e.g. "2026-10-21"
    position: {
      type: mongoose.Schema.ObjectId,
      ref: 'LeadershipPosition',
      required: true,
      immutable: true,
    },
    positionCode: { type: String, required: true, immutable: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 120 },
    scope: { type: scopeSchema, required: true },
    seats: { type: Number, min: 1, max: 100, default: 1 },
    votesPerVoter: { type: Number, min: 1, max: 100, default: 1 },
    schedule: {
      nominationsOpenAt: { type: Date, required: true },
      nominationsCloseAt: { type: Date, required: true },
      votingOpenAt: { type: Date, required: true },
      votingCloseAt: { type: Date, required: true },
      disputesCloseAt: { type: Date, required: true },
    },
    // rules frozen when the election is created (later config edits don't change a running election)
    rules: {
      candidateEligibility: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      voterEligibility: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      tieBreak: { type: String, required: true },
      academicStanding: { type: String, required: true },
      campaign: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    },
    // tie-break seed is committed (hash shown) when the election is created and revealed at the count
    lotSeedHash: { type: String, required: true, immutable: true },
    lotSeed: { type: String, select: false, immutable: true },
    // terminal / exceptional states are stored; the rest follow the schedule
    state: { type: String, enum: ['open', 'certified', 'cancelled', 'void'], default: 'open' },
    results: {
      tallies: [
        {
          candidacy: mongoose.Schema.ObjectId,
          player: mongoose.Schema.ObjectId,
          votes: Number,
          _id: false,
        },
      ],
      winners: [{ type: mongoose.Schema.ObjectId }],
      ballots: Number,
      eligibleVoters: Number,
      tieBreak: { applied: Boolean, method: String, seed: String, detail: String },
      hash: String,
      certifiedAt: Date,
    },
    cancellation: { reason: String, by: String, at: Date },
  },
  { timestamps: true, minimize: false },
);
electionSchema.index(
  { university: 1, cycle: 1, positionCode: 1, 'scope.unit': 1 },
  { unique: true },
);
electionSchema.index({ university: 1, 'schedule.votingCloseAt': -1 });

// certified results can never be changed
electionSchema.pre('save', function () {
  if (
    !this.isNew &&
    this.$locals.wasCertified &&
    (this.isModified('results') || this.isModified('state'))
  ) {
    throw new Error('Certified election results cannot be changed');
  }
});
electionSchema.post('init', function () {
  this.$locals.wasCertified = this.state === 'certified';
});
electionSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function () {
  // updates that would touch a certified election's results are refused at the query level
  const filter = this.getFilter();
  if (!this.getOptions().allowCertified && filter.state === undefined) {
    this.setQuery({ ...filter, state: mongoose.trusted({ $ne: 'certified' }) });
  }
});

export const CANDIDACY_STATUSES = ['nominated', 'withdrawn', 'disqualified'];

const candidacySchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.ObjectId, ref: 'Election', required: true, immutable: true },
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    status: { type: String, enum: CANDIDACY_STATUSES, default: 'nominated' },
    slogan: { type: String, trim: true, maxlength: 80 },
    manifesto: {
      summary: { type: String, trim: true, maxlength: 600 },
      points: { type: [String], default: [] },
    },
    poster: { color: { type: String, maxlength: 9 }, layout: { type: String, maxlength: 20 } },
    statusReason: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
candidacySchema.index({ election: 1, player: 1 }, { unique: true });
candidacySchema.index({ player: 1, status: 1 });

export const CAMPAIGN_KINDS = ['poster', 'speech', 'event', 'debate-answer'];

const campaignItemSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.ObjectId, ref: 'Election', required: true, immutable: true },
    candidacy: {
      type: mongoose.Schema.ObjectId,
      ref: 'Candidacy',
      required: true,
      immutable: true,
    },
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    kind: { type: String, enum: CAMPAIGN_KINDS, required: true, immutable: true },
    title: { type: String, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 1500 },
    question: { type: Number, min: 0, max: 20 }, // debate question index
    location: { type: String, maxlength: 80 },
    startsAt: Date,
    removedAt: Date,
  },
  { timestamps: true },
);
campaignItemSchema.index({ election: 1, createdAt: -1 });
campaignItemSchema.index({ candidacy: 1, kind: 1 });

// support for a campaign — public, fictional "buzz"; never counted as votes
const supportSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.ObjectId, ref: 'Election', required: true, immutable: true },
    candidacy: {
      type: mongoose.Schema.ObjectId,
      ref: 'Candidacy',
      required: true,
      immutable: true,
    },
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    kind: { type: String, enum: ['endorse', 'volunteer'], required: true, immutable: true },
  },
  { timestamps: true },
);
// one endorsement and one volunteer role per player per election
supportSchema.index({ election: 1, player: 1, kind: 1 }, { unique: true });
supportSchema.index({ candidacy: 1, kind: 1 });

const receiptSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.ObjectId, ref: 'Election', required: true, immutable: true },
    voter: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    votedAt: { type: Date, default: () => new Date(), immutable: true },
  },
  { timestamps: false },
);
// THE double-voting guard: one ballot per player per election
receiptSchema.index({ election: 1, voter: 1 }, { unique: true });

const voteSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    election: { type: mongoose.Schema.ObjectId, ref: 'Election', required: true, immutable: true },
    candidacy: {
      type: mongoose.Schema.ObjectId,
      ref: 'Candidacy',
      required: true,
      immutable: true,
    },
    ballot: { type: String, required: true, immutable: true }, // the voter's private ballot code (hashed)
  },
  { timestamps: false, versionKey: false },
);
voteSchema.index({ election: 1, candidacy: 1 });
voteSchema.index({ ballot: 1 });
voteSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'],
  function () {
    if (!this.getOptions().ballotMaintenance) throw new Error('Votes cannot be changed or deleted');
  },
);

const disputeSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.ObjectId, ref: 'Election', required: true, immutable: true },
    filedBy: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    reason: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['open', 'upheld', 'rejected'], default: 'open' },
    resolution: { note: String, by: String, at: Date },
  },
  { timestamps: true },
);
disputeSchema.index({ election: 1, status: 1 });
disputeSchema.index({ election: 1, filedBy: 1 }, { unique: true });

// an office held after a certified election
const assignmentSchema = new mongoose.Schema(
  {
    university: universityRef(),
    position: {
      type: mongoose.Schema.ObjectId,
      ref: 'LeadershipPosition',
      required: true,
      immutable: true,
    },
    positionCode: { type: String, required: true, immutable: true },
    title: { type: String, required: true },
    scope: { type: scopeSchema, required: true },
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    election: { type: mongoose.Schema.ObjectId, ref: 'Election', immutable: true },
    privileges: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'ended', 'removed'], default: 'active' },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    endedReason: String,
  },
  { timestamps: true },
);
assignmentSchema.index(
  { election: 1, player: 1 },
  { unique: true, partialFilterExpression: { election: { $type: 'objectId' } } },
);
assignmentSchema.index({ player: 1, status: 1 });
assignmentSchema.index({ university: 1, 'scope.type': 1, 'scope.unit': 1, status: 1 });

// what leaders did with their privileges (announcements, official events, welfare grants)
const leaderActionSchema = new mongoose.Schema(
  {
    university: universityRef(),
    assignment: {
      type: mongoose.Schema.ObjectId,
      ref: 'LeadershipAssignment',
      required: true,
      immutable: true,
    },
    leader: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    kind: {
      type: String,
      enum: ['announcement', 'official-event', 'welfare-grant'],
      required: true,
      immutable: true,
    },
    scope: { type: scopeSchema, required: true },
    title: { type: String, maxlength: 120 },
    body: { type: String, maxlength: 1500 },
    recipient: { type: mongoose.Schema.ObjectId, ref: 'Player' },
    amount: Number,
    ref: { type: String, maxlength: 80 },
    week: { type: String, maxlength: 10 },
  },
  { timestamps: true },
);
leaderActionSchema.index({
  university: 1,
  'scope.type': 1,
  'scope.unit': 1,
  kind: 1,
  createdAt: -1,
});
leaderActionSchema.index({ assignment: 1, kind: 1, week: 1 });

// append-only audit log of everything that happens to an election
const auditSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.ObjectId, ref: 'Election', required: true, immutable: true },
    action: { type: String, required: true, maxlength: 60, immutable: true },
    actor: { type: String, required: true, maxlength: 80, immutable: true },
    detail: { type: mongoose.Schema.Types.Mixed, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ election: 1, createdAt: 1 });
auditSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'],
  function () {
    throw new Error('The election audit log is append-only');
  },
);

export const Election = mongoose.model('Election', electionSchema);
export const Candidacy = mongoose.model('Candidacy', candidacySchema);
export const CampaignItem = mongoose.model('CampaignItem', campaignItemSchema);
export const CampaignSupport = mongoose.model('CampaignSupport', supportSchema);
export const VoteReceipt = mongoose.model('VoteReceipt', receiptSchema);
export const Vote = mongoose.model('Vote', voteSchema);
export const ElectionDispute = mongoose.model('ElectionDispute', disputeSchema);
export const LeadershipAssignment = mongoose.model('LeadershipAssignment', assignmentSchema);
export const LeaderAction = mongoose.model('LeaderAction', leaderActionSchema);
export const ElectionAudit = mongoose.model('ElectionAudit', auditSchema);
