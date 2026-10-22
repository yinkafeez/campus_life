import { createHash, randomBytes } from 'node:crypto';
import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { runAtomic } from '../../core/db/atomic.js';
import { bus, EVENTS } from '../../core/events.js';
import University from '../universities/university.model.js';
import Faculty from '../academics/faculty.model.js';
import Department from '../academics/department.model.js';
import Hostel from '../accommodation/hostel.model.js';
import LeadershipPosition from '../leadership/leadershipPosition.model.js';
import StudentRecord from '../students/studentRecord.model.js';
import Player from '../players/player.model.js';
import User from '../auth/user.model.js';
import { filterText } from '../moderation/textFilter.js';
import { universityOfPlayer } from '../campus/campus.service.js';
import {
  CampaignItem,
  CampaignSupport,
  Candidacy,
  Election,
  ElectionAudit,
  ElectionDispute,
  LeadershipAssignment,
  Vote,
  VoteReceipt,
} from './elections.models.js';
import { candidateCheck, explain, inScope, voterCheck } from './eligibility.js';

/*
 * ELECTIONS — the lifecycle of a game election:
 *   scheduled → nominations → campaign → voting → counting (provisional results, dispute
 *   window) → certified (leaders assigned)   |  cancelled (admin, with reason)  |  void (no
 *   valid result: no candidates / no votes)
 * Phases follow the frozen schedule; certification happens once, atomically, when the
 * dispute window has closed with no open disputes. Results are computed ONLY from the
 * recorded votes; campaign "buzz" is shown but never counted.
 */
const trusted = (q) => mongoose.trusted(q);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const DAY = 86_400_000;
const TERM_DAYS_PER_SESSION = 120; // a game "session" for the length of an office

async function audit(election, action, actor, detail, session = null) {
  await ElectionAudit.create([{ election: election._id ?? election, action, actor, detail }], {
    session,
  });
}

// ─── Phase ────────────────────────────────────────────────────────────────
export function phaseOf(election, { openDisputes = 0, now = new Date() } = {}) {
  if (['certified', 'cancelled', 'void'].includes(election.state)) return election.state;
  const s = election.schedule;
  if (now < s.nominationsOpenAt) return 'scheduled';
  if (now < s.nominationsCloseAt) return 'nominations';
  if (now < s.votingOpenAt) return 'campaign';
  if (now < s.votingCloseAt) return 'voting';
  if (openDisputes > 0) return 'disputed';
  return 'counting';
}

// ─── Admin: open an election cycle ────────────────────────────────────────
async function scopeUnits(university, scope) {
  if (scope === 'university') return [{ type: 'university', unitName: university.shortName }];
  if (scope === 'faculty') {
    const list = await Faculty.find({ university: university._id }).select('name');
    return list.map((f) => ({ type: 'faculty', unit: f._id, unitName: f.name }));
  }
  if (scope === 'department') {
    const list = await Department.find({ university: university._id }).select('name');
    return list.map((d) => ({ type: 'department', unit: d._id, unitName: d.name }));
  }
  // halls the game can house players in
  const list = await Hostel.find({
    university: university._id,
    'roomPlan.rooms': trusted({ $gte: 1 }),
  }).select('name');
  return list.map((h) => ({ type: 'hall', unit: h._id, unitName: h.name }));
}

/** Create one election per elected position and unit. Idempotent per cycle. */
export async function openCycle(
  university,
  { cycle, startsAt = new Date(), positionCodes } = {},
  actor = 'admin',
) {
  const cfg = university.config.elections;
  const label = cycle ?? new Date(startsAt).toISOString().slice(0, 10);
  const filter = { university: university._id, isElected: trusted({ $ne: false }) };
  if (positionCodes?.length) filter.code = trusted({ $in: positionCodes });
  const positions = await LeadershipPosition.find(filter).sort({ scope: 1, rank: 1 });

  const t0 = new Date(startsAt).getTime();
  const schedule = {
    nominationsOpenAt: new Date(t0),
    nominationsCloseAt: new Date(t0 + cfg.nominationDays * DAY),
    votingOpenAt: new Date(t0 + (cfg.nominationDays + cfg.campaignDays) * DAY),
    votingCloseAt: new Date(
      t0 + (cfg.nominationDays + cfg.campaignDays) * DAY + cfg.votingHours * 3_600_000,
    ),
  };
  schedule.disputesCloseAt = new Date(
    schedule.votingCloseAt.getTime() + cfg.disputeHours * 3_600_000,
  );

  const created = [];
  /* eslint-disable no-await-in-loop -- one position at a time, a handful of units each */
  for (const position of positions) {
    for (const scope of await scopeUnits(university, position.scope)) {
      const seed = randomBytes(32).toString('hex');
      try {
        const [election] = await Election.create([
          {
            university: university._id,
            cycle: label,
            position: position._id,
            positionCode: position.code,
            title:
              scope.type === 'university'
                ? position.title
                : `${position.title} — ${scope.unitName}`,
            body: position.body,
            scope,
            seats: position.seats,
            votesPerVoter: position.seats,
            schedule,
            rules: {
              candidateEligibility: {
                ...cfg.defaultCandidateEligibility,
                ...position.candidateEligibility,
              },
              voterEligibility: cfg.voterEligibility,
              tieBreak: cfg.tieBreak,
              academicStanding: cfg.academicStanding,
              campaign: cfg.campaign,
            },
            lotSeed: seed,
            lotSeedHash: sha256(seed),
          },
        ]);
        await audit(election, 'created', actor, { schedule, lotSeedHash: election.lotSeedHash });
        created.push(election);
      } catch (err) {
        if (err.code !== 11000) throw err; // already in this cycle
      }
    }
  }
  /* eslint-enable no-await-in-loop */
  return { cycle: label, created: created.length, schedule };
}

// ─── Reading ──────────────────────────────────────────────────────────────
async function playerCards(ids) {
  const players = await Player.find({ _id: trusted({ $in: ids }) }).select('displayName user');
  const users = await User.find({ _id: trusted({ $in: players.map((p) => p.user) }) }).select(
    'username',
  );
  const names = new Map(users.map((u) => [String(u._id), u.username]));
  return new Map(
    players.map((p) => [
      String(p._id),
      { playerId: p._id, displayName: p.displayName, username: names.get(String(p.user)) },
    ]),
  );
}

async function requireStudentUniversity(player) {
  const university = await universityOfPlayer(player._id);
  if (!university)
    throw new AppError(
      'Get admitted to a university to take part in student elections.',
      409,
      'NOT_ENROLLED',
    );
  return university;
}

/** Elections the player can see: their university's, for constituencies they belong to. */
export async function listElections(player) {
  const university = await requireStudentUniversity(player);
  const record = await StudentRecord.findOne({ player: player._id });
  const since = new Date(Date.now() - 45 * DAY);
  const elections = await Election.find({
    university: university._id,
    'schedule.disputesCloseAt': trusted({ $gte: since }),
  }).sort({
    'scope.type': 1,
    positionCode: 1,
  });
  const visible = [];
  /* eslint-disable no-await-in-loop -- scope checks are cheap; hall checks hit one index */
  for (const e of elections) {
    if (!(await inScope(e.scope, record))) continue;
    const settled = await settle(e);
    visible.push(settled);
  }
  /* eslint-enable no-await-in-loop */
  const ids = visible.map((e) => e._id);
  const [mine, voted, counts] = await Promise.all([
    Candidacy.find({ player: player._id, election: trusted({ $in: ids }) }).select(
      'election status',
    ),
    VoteReceipt.find({ voter: player._id, election: trusted({ $in: ids }) }).select('election'),
    Candidacy.aggregate([
      { $match: { election: { $in: ids }, status: 'nominated' } },
      { $group: { _id: '$election', n: { $sum: 1 } } },
    ]),
  ]);
  const myCand = new Map(mine.map((c) => [String(c.election), c.status]));
  const votedIn = new Set(voted.map((v) => String(v.election)));
  const candCount = new Map(counts.map((c) => [String(c._id), c.n]));
  return visible.map((e) => ({
    ...summary(e),
    candidates: candCount.get(String(e._id)) ?? 0,
    myCandidacy: myCand.get(String(e._id)) ?? null,
    hasVoted: votedIn.has(String(e._id)),
  }));
}

const summary = (e) => ({
  id: e._id,
  cycle: e.cycle,
  title: e.title,
  body: e.body ?? null,
  positionCode: e.positionCode,
  scope: { type: e.scope.type, unitName: e.scope.unitName ?? null },
  seats: e.seats,
  votesPerVoter: e.votesPerVoter,
  schedule: e.schedule,
  phase: e.$locals.phase ?? phaseOf(e),
});

/** Bring an election up to date: certify (or void) once its dispute window is over. */
async function settle(election) {
  const openDisputes = await ElectionDispute.countDocuments({
    election: election._id,
    status: 'open',
  });
  const phase = phaseOf(election, { openDisputes });
  election.$locals.phase = phase;
  if (phase === 'counting' && new Date() >= election.schedule.disputesCloseAt) {
    const done = await certify(election, 'system');
    done.$locals.phase = phaseOf(done);
    return done;
  }
  return election;
}

/** Full election view: candidates, campaign, my status, results when available. */
export async function getElection(player, electionId) {
  const university = await requireStudentUniversity(player);
  let election = await Election.findOne({ _id: electionId, university: university._id });
  if (!election) throw AppError.notFound('Election not found.');
  const record = await StudentRecord.findOne({ player: player._id });
  if (!(await inScope(election.scope, record))) throw AppError.notFound('Election not found.');
  election = await settle(election);
  const phase = election.$locals.phase;

  const candidacies = await Candidacy.find({
    election: election._id,
    status: trusted({ $ne: 'withdrawn' }),
  }).sort({ createdAt: 1 });
  const [cards, support, items, myReceipt, voterStatus, candStatus, disputes] = await Promise.all([
    playerCards(candidacies.map((c) => c.player)),
    CampaignSupport.aggregate([
      { $match: { election: election._id } },
      { $group: { _id: { candidacy: '$candidacy', kind: '$kind' }, n: { $sum: 1 } } },
    ]),
    CampaignItem.find({ election: election._id, removedAt: trusted({ $exists: false }) })
      .sort({ createdAt: -1 })
      .limit(100),
    VoteReceipt.exists({ election: election._id, voter: player._id }),
    voterCheck(player, election, university),
    candidateCheck(player, election, university),
    ElectionDispute.find({ election: election._id }).select('status createdAt'),
  ]);
  const count = (candidacy, kind) =>
    support.find((s) => String(s._id.candidacy) === String(candidacy) && s._id.kind === kind)?.n ??
    0;
  const itemCount = (candidacy) =>
    items.filter((i) => String(i.candidacy) === String(candidacy)).length;
  const mySupport = await CampaignSupport.find({
    election: election._id,
    player: player._id,
  }).select('candidacy kind');
  const myCandidacy = candidacies.find((c) => String(c.player) === String(player._id)) ?? null;
  const showResults = ['counting', 'disputed', 'certified'].includes(phase);
  const provisional = showResults && phase !== 'certified' ? await tally(election) : null;
  const results = phase === 'certified' ? election.results : provisional;

  return {
    election: {
      ...summary(election),
      rules: {
        candidateEligibility: election.rules.candidateEligibility,
        voterEligibility: election.rules.voterEligibility,
        tieBreak: election.rules.tieBreak,
        academicStanding: election.rules.academicStanding,
        campaign: election.rules.campaign,
      },
      lotSeedHash: election.lotSeedHash,
      cancellation: election.state === 'cancelled' ? election.cancellation : null,
      disputes: {
        open: disputes.filter((d) => d.status === 'open').length,
        total: disputes.length,
      },
    },
    candidates: candidacies.map((c) => ({
      id: c._id,
      status: c.status,
      statusReason: c.status === 'disqualified' ? c.statusReason : null,
      ...cards.get(String(c.player)),
      slogan: c.slogan ?? null,
      manifesto: c.manifesto,
      poster: c.poster,
      // fictional popularity — shown for flavour, never part of the count
      buzz: {
        endorsements: count(c._id, 'endorse'),
        volunteers: count(c._id, 'volunteer'),
        activities: itemCount(c._id),
      },
    })),
    campaign: items.map((i) => ({
      id: i._id,
      candidacy: i.candidacy,
      kind: i.kind,
      title: i.title ?? null,
      body: i.body ?? null,
      question: i.question ?? null,
      location: i.location ?? null,
      startsAt: i.startsAt ?? null,
      createdAt: i.createdAt,
    })),
    me: {
      canVote: voterStatus.eligible,
      voteReasons: explain(voterStatus.reasons),
      canStand: candStatus.eligible,
      standReasons: explain(candStatus.reasons),
      gameStanding: voterStatus.profile?.cgpa ?? null,
      hasVoted: Boolean(myReceipt),
      candidacy: myCandidacy ? { id: myCandidacy._id, status: myCandidacy.status } : null,
      support: mySupport.map((s) => ({ candidacy: s.candidacy, kind: s.kind })),
    },
    results: results
      ? {
          provisional: phase !== 'certified',
          ballots: results.ballots,
          eligibleVoters: results.eligibleVoters ?? null,
          tallies: results.tallies.map((t) => ({
            candidacy: t.candidacy,
            ...cards.get(String(t.player)),
            votes: t.votes,
          })),
          winners: results.winners,
          tieBreak: results.tieBreak ?? null,
          hash: results.hash ?? null,
          certifiedAt: results.certifiedAt ?? null,
        }
      : null,
  };
}

// ─── Candidates & campaigns ───────────────────────────────────────────────
async function loadForPlayer(player, electionId) {
  const university = await requireStudentUniversity(player);
  const election = await Election.findOne({ _id: electionId, university: university._id });
  if (!election) throw AppError.notFound('Election not found.');
  return { university, election: await settle(election) };
}

const clean = (text) => (text ? filterText(text, { isPublic: true }).text : text);

export async function nominate(player, electionId, { slogan, manifesto, poster }) {
  const { university, election } = await loadForPlayer(player, electionId);
  if (election.$locals.phase !== 'nominations')
    throw new AppError('Nominations are not open for this election.', 409, 'NOMINATIONS_CLOSED');
  const check = await candidateCheck(player, election, university);
  if (!check.eligible)
    throw new AppError(explain(check.reasons)[0], 403, 'NOT_ELIGIBLE', explain(check.reasons));
  // one candidacy per player per election cycle
  const cycleElections = await Election.find({
    university: university._id,
    cycle: election.cycle,
  }).select('_id');
  const other = await Candidacy.exists({
    player: player._id,
    status: 'nominated',
    election: trusted({
      $in: cycleElections.map((e) => e._id).filter((id) => String(id) !== String(election._id)),
    }),
  });
  if (other)
    throw new AppError(
      'You are already contesting another position in this election cycle.',
      409,
      'ALREADY_CONTESTING',
    );
  try {
    const candidacy = await Candidacy.create({
      election: election._id,
      player: player._id,
      slogan: clean(slogan),
      manifesto: {
        summary: clean(manifesto?.summary),
        points: (manifesto?.points ?? []).map(clean),
      },
      poster,
    });
    await audit(election, 'nominated', `player:${player._id}`, { candidacy: candidacy._id });
    return candidacy;
  } catch (err) {
    if (err.code === 11000) throw AppError.conflict('You have already applied for this position.');
    throw err;
  }
}

async function myCandidacy(player, election) {
  const candidacy = await Candidacy.findOne({
    election: election._id,
    player: player._id,
    status: 'nominated',
  });
  if (!candidacy) throw AppError.forbidden('You are not a candidate in this election.');
  return candidacy;
}

export async function updateManifesto(player, electionId, { slogan, manifesto, poster }) {
  const { election } = await loadForPlayer(player, electionId);
  if (!['nominations', 'campaign'].includes(election.$locals.phase))
    throw new AppError('Manifestos are locked once voting starts.', 409, 'CAMPAIGN_CLOSED');
  const candidacy = await myCandidacy(player, election);
  if (slogan !== undefined) candidacy.slogan = clean(slogan);
  if (manifesto)
    candidacy.manifesto = {
      summary: clean(manifesto.summary),
      points: (manifesto.points ?? []).map(clean),
    };
  if (poster) candidacy.poster = poster;
  await candidacy.save();
  return candidacy;
}

export async function withdraw(player, electionId) {
  const { election } = await loadForPlayer(player, electionId);
  if (!['nominations', 'campaign'].includes(election.$locals.phase))
    throw new AppError('You can no longer withdraw.', 409, 'WITHDRAW_CLOSED');
  const candidacy = await myCandidacy(player, election);
  candidacy.status = 'withdrawn';
  await candidacy.save();
  await audit(election, 'withdrawn', `player:${player._id}`, { candidacy: candidacy._id });
}

const ITEM_LIMIT = { poster: 'maxPosters', speech: 'maxSpeeches', event: 'maxEvents' };

export async function addCampaignItem(
  player,
  electionId,
  { kind, title, body, question, location, startsAt },
) {
  const { election } = await loadForPlayer(player, electionId);
  if (!['nominations', 'campaign'].includes(election.$locals.phase))
    throw new AppError('Campaigning is closed for this election.', 409, 'CAMPAIGN_CLOSED');
  const candidacy = await myCandidacy(player, election);
  const rules = election.rules.campaign ?? {};
  if (kind === 'debate-answer') {
    const questions = rules.debateQuestions ?? [];
    if (question == null || question >= questions.length)
      throw AppError.badRequest('Pick one of the debate questions.');
    if (
      await CampaignItem.exists({
        candidacy: candidacy._id,
        kind,
        question,
        removedAt: trusted({ $exists: false }),
      })
    ) {
      throw AppError.conflict('You already answered this debate question.');
    }
  } else {
    const used = await CampaignItem.countDocuments({
      candidacy: candidacy._id,
      kind,
      removedAt: trusted({ $exists: false }),
    });
    if (used >= (rules[ITEM_LIMIT[kind]] ?? 3))
      throw new AppError(
        `You have used all your ${kind}s for this campaign.`,
        409,
        'CAMPAIGN_LIMIT',
      );
  }
  const item = await CampaignItem.create({
    election: election._id,
    candidacy: candidacy._id,
    player: player._id,
    kind,
    title: clean(title),
    body: clean(body),
    question,
    location,
    startsAt: startsAt ? new Date(startsAt) : undefined,
  });
  await audit(election, 'campaign-item', `player:${player._id}`, { kind, item: item._id });
  return item;
}

/** Endorse or volunteer for a candidate (eligible voters only; never counted as votes). */
export async function support(player, electionId, { candidacyId, kind }) {
  const { university, election } = await loadForPlayer(player, electionId);
  if (!['nominations', 'campaign', 'voting'].includes(election.$locals.phase))
    throw new AppError('This campaign is over.', 409, 'CAMPAIGN_CLOSED');
  const check = await voterCheck(player, election, university);
  if (!check.eligible)
    throw new AppError(
      'Only voters in this constituency can support a campaign.',
      403,
      'NOT_ELIGIBLE',
    );
  const candidacy = await Candidacy.findOne({
    _id: candidacyId,
    election: election._id,
    status: 'nominated',
  });
  if (!candidacy) throw AppError.notFound('Candidate not found.');
  if (String(candidacy.player) === String(player._id))
    throw AppError.badRequest('You can’t support your own campaign.');
  if (kind === 'volunteer') {
    const max = election.rules.campaign?.maxVolunteers ?? 30;
    if ((await CampaignSupport.countDocuments({ candidacy: candidacy._id, kind })) >= max) {
      throw new AppError('This campaign has enough volunteers.', 409, 'CAMPAIGN_LIMIT');
    }
  }
  try {
    await CampaignSupport.create({
      election: election._id,
      candidacy: candidacy._id,
      player: player._id,
      kind,
    });
  } catch (err) {
    if (err.code === 11000)
      throw AppError.conflict(
        kind === 'endorse'
          ? 'You already endorsed a candidate in this election.'
          : 'You already volunteer for a campaign in this election.',
      );
    throw err;
  }
}

export async function removeSupport(player, electionId, kind) {
  await CampaignSupport.deleteOne({ election: electionId, player: player._id, kind });
}

// ─── Voting ───────────────────────────────────────────────────────────────
/** Cast a ballot. Returns a private ballot code the voter can use to check it was counted. */
export async function castVote(player, electionId, candidacyIds) {
  const { university, election } = await loadForPlayer(player, electionId);
  if (election.$locals.phase !== 'voting')
    throw new AppError('Voting is not open for this election.', 409, 'VOTING_CLOSED');
  const check = await voterCheck(player, election, university);
  if (!check.eligible)
    throw new AppError(explain(check.reasons)[0], 403, 'NOT_ELIGIBLE', explain(check.reasons));

  const unique = [...new Set(candidacyIds.map(String))];
  if (unique.length !== candidacyIds.length)
    throw AppError.badRequest('Choose each candidate at most once.');
  if (unique.length < 1 || unique.length > election.votesPerVoter) {
    throw AppError.badRequest(`Choose between 1 and ${election.votesPerVoter} candidate(s).`);
  }
  const valid = await Candidacy.countDocuments({
    _id: trusted({ $in: unique }),
    election: election._id,
    status: 'nominated',
  });
  if (valid !== unique.length)
    throw AppError.badRequest(
      'Your ballot includes someone who is not a candidate in this election.',
    );

  const code = randomBytes(16).toString('hex');
  const ballot = sha256(`${election._id}:${code}`);
  await runAtomic(async (session) => {
    // the receipt is the double-voting guard (unique {election, voter})
    try {
      await VoteReceipt.create([{ election: election._id, voter: player._id }], { session });
    } catch (err) {
      if (err.code === 11000)
        throw new AppError('You have already voted in this election.', 409, 'ALREADY_VOTED');
      throw err;
    }
    try {
      await Vote.insertMany(
        unique.map((candidacy) => ({ election: election._id, candidacy, ballot })),
        { session },
      );
    } catch (err) {
      // standalone database: undo the receipt so the player can try again
      if (!session) await VoteReceipt.deleteOne({ election: election._id, voter: player._id });
      throw err;
    }
  });
  return { ballotCode: code, choices: unique.length };
}

/** A voter checks their own ballot with the private code they were given. */
export async function verifyBallot(player, electionId, code) {
  const ballot = sha256(`${electionId}:${code}`);
  const votes = await Vote.find({ election: electionId, ballot }).select('candidacy');
  if (!votes.length) throw AppError.notFound('No ballot with that code in this election.');
  return { counted: true, candidacies: votes.map((v) => v.candidacy) };
}

// ─── Counting & certification ─────────────────────────────────────────────
/** Count the recorded votes (only for candidates still standing) and pick winners. */
export async function tally(election) {
  const candidacies = await Candidacy.find({ election: election._id, status: 'nominated' }).sort({
    createdAt: 1,
  });
  const rows = await Vote.aggregate([
    { $match: { election: election._id, candidacy: { $in: candidacies.map((c) => c._id) } } },
    { $group: { _id: '$candidacy', votes: { $sum: 1 } } },
  ]);
  const votesFor = new Map(rows.map((r) => [String(r._id), r.votes]));
  const ballots = (await Vote.distinct('ballot', { election: election._id })).length;
  const full = election.lotSeed
    ? election
    : await Election.findById(election._id).select('+lotSeed');
  const seed = full.lotSeed;

  const tallies = candidacies.map((c, nominationOrder) => ({
    candidacy: c._id,
    player: c.player,
    votes: votesFor.get(String(c._id)) ?? 0,
    nominationOrder,
  }));
  // ranking: votes desc; ties broken by the configured rule (drawing of lots uses the committed seed)
  const lot = (t) => sha256(`${seed}:${t.candidacy}`);
  tallies.sort(
    (a, b) =>
      b.votes - a.votes ||
      (election.rules.tieBreak === 'earliest-nomination'
        ? a.nominationOrder - b.nominationOrder
        : lot(a).localeCompare(lot(b))),
  );

  const contenders = tallies.filter((t) => t.votes > 0);
  const winners = contenders.slice(0, election.seats);
  const cutoff = winners[winners.length - 1];
  const tied = cutoff ? contenders.filter((t) => t.votes === cutoff.votes) : [];
  const tieApplied =
    Boolean(cutoff) &&
    tied.length > 1 &&
    contenders.length > election.seats &&
    tied.some((t) => !winners.includes(t));
  const results = {
    tallies: tallies.map(({ candidacy, player, votes }) => ({ candidacy, player, votes })),
    winners: winners.map((w) => w.candidacy),
    ballots,
    tieBreak: tieApplied
      ? {
          applied: true,
          method: election.rules.tieBreak,
          seed: election.rules.tieBreak === 'drawing-of-lots' ? seed : undefined,
          detail: `${tied.length} candidates tied on ${cutoff.votes} vote(s) for the last seat`,
        }
      : { applied: false },
  };
  return results;
}

async function eligibleVoterCount(election) {
  const filter = {
    university: election.university,
    status: trusted({ $in: ['matriculated', 'active'] }),
  };
  if (election.scope.type === 'faculty') filter.faculty = election.scope.unit;
  if (election.scope.type === 'department') filter.department = election.scope.unit;
  if (election.scope.type === 'hall') return null; // residents change over time; not reported
  return StudentRecord.countDocuments(filter);
}

/** Certify once: freeze the results (hash-sealed) and assign the winners to office. */
export async function certify(election, actor) {
  if (await ElectionDispute.exists({ election: election._id, status: 'open' })) {
    throw new AppError('Resolve the open disputes first.', 409, 'DISPUTES_OPEN');
  }
  const results = await tally(election);
  results.eligibleVoters = await eligibleVoterCount(election);
  results.certifiedAt = new Date();
  results.hash = sha256(
    JSON.stringify({
      e: String(election._id),
      t: results.tallies.map((t) => [String(t.candidacy), t.votes]),
      b: results.ballots,
      w: results.winners.map(String),
    }),
  );
  const voided = results.winners.length === 0;

  const updated = await Election.findOneAndUpdate(
    { _id: election._id, state: 'open', 'schedule.votingCloseAt': trusted({ $lte: new Date() }) },
    { $set: { state: voided ? 'void' : 'certified', results } },
    { returnDocument: 'after' },
  );
  if (!updated) return (await Election.findById(election._id)) ?? election; // someone else certified it first
  await audit(updated, voided ? 'voided' : 'certified', actor, {
    hash: results.hash,
    ballots: results.ballots,
    winners: results.winners,
  });

  if (!voided) {
    const position = await LeadershipPosition.findById(updated.position);
    const university = await University.findById(updated.university);
    const privileges = position.privileges?.length
      ? position.privileges
      : university.config.leadership.privilegesByScope[updated.scope.type];
    const now = new Date();
    const winnerCands = await Candidacy.find({ _id: trusted({ $in: results.winners }) });
    // the previous holders of this office (same position + unit) step down
    await LeadershipAssignment.updateMany(
      {
        university: updated.university,
        position: updated.position,
        'scope.unit': updated.scope.unit ?? null,
        status: 'active',
      },
      { $set: { status: 'ended', endedReason: 'Succeeded after an election' } },
    );
    /* eslint-disable no-await-in-loop -- one or a few winners */
    for (const c of winnerCands) {
      await LeadershipAssignment.updateOne(
        { election: updated._id, player: c.player },
        {
          $setOnInsert: {
            university: updated.university,
            position: updated.position,
            positionCode: updated.positionCode,
            title: updated.title,
            scope: updated.scope,
            player: c.player,
            election: updated._id,
            privileges,
            status: 'active',
            startsAt: now,
            endsAt: new Date(
              now.getTime() + (position.termLengthSessions ?? 1) * TERM_DAYS_PER_SESSION * DAY,
            ),
          },
        },
        { upsert: true },
      );
      bus.emit(EVENTS.ELECTION_RESULT, {
        toPlayerId: String(c.player),
        electionId: String(updated._id),
        title: updated.title,
        won: true,
      });
    }
    /* eslint-enable no-await-in-loop */
  }
  return updated;
}

// ─── Disputes & admin actions ─────────────────────────────────────────────
export async function fileDispute(player, electionId, reason) {
  const { election } = await loadForPlayer(player, electionId);
  const now = new Date();
  if (
    now < election.schedule.votingCloseAt ||
    now >= election.schedule.disputesCloseAt ||
    election.state !== 'open'
  ) {
    throw new AppError(
      'Disputes can only be filed after voting closes and before results are certified.',
      409,
      'DISPUTE_WINDOW_CLOSED',
    );
  }
  const isCandidate = await Candidacy.exists({ election: election._id, player: player._id });
  const voted = await VoteReceipt.exists({ election: election._id, voter: player._id });
  if (!isCandidate && !voted)
    throw AppError.forbidden('Only candidates and voters in this election can file a dispute.');
  try {
    const dispute = await ElectionDispute.create({
      election: election._id,
      filedBy: player._id,
      reason: clean(reason),
    });
    await audit(election, 'dispute-filed', `player:${player._id}`, { dispute: dispute._id });
    return dispute;
  } catch (err) {
    if (err.code === 11000)
      throw AppError.conflict('You already filed a dispute for this election.');
    throw err;
  }
}

/** Admin: upheld → the election is cancelled (re-run it in a new cycle); rejected → it continues. */
export async function resolveDispute(disputeId, { decision, note }, actor) {
  const dispute = await ElectionDispute.findOneAndUpdate(
    { _id: disputeId, status: 'open' },
    { $set: { status: decision, resolution: { note, by: actor, at: new Date() } } },
    { returnDocument: 'after' },
  );
  if (!dispute) throw AppError.notFound('No open dispute with that id.');
  const election = await Election.findById(dispute.election);
  await audit(election, `dispute-${decision}`, actor, { dispute: dispute._id, note });
  if (decision === 'upheld') await cancelElection(election._id, `Dispute upheld: ${note}`, actor);
  return dispute;
}

export async function cancelElection(electionId, reason, actor) {
  const updated = await Election.findOneAndUpdate(
    { _id: electionId, state: 'open' },
    { $set: { state: 'cancelled', cancellation: { reason, by: actor, at: new Date() } } },
    { returnDocument: 'after' },
  );
  if (!updated)
    throw new AppError(
      'Only an election that is not yet certified can be cancelled.',
      409,
      'CANNOT_CANCEL',
    );
  await audit(updated, 'cancelled', actor, { reason });
  return updated;
}

export async function disqualify(electionId, candidacyId, reason, actor) {
  const election = await Election.findOne({ _id: electionId, state: 'open' });
  if (!election) throw new AppError('The election is closed.', 409, 'ELECTION_CLOSED');
  const candidacy = await Candidacy.findOneAndUpdate(
    { _id: candidacyId, election: electionId, status: 'nominated' },
    { $set: { status: 'disqualified', statusReason: reason } },
    { returnDocument: 'after' },
  );
  if (!candidacy) throw AppError.notFound('No standing candidate with that id.');
  await audit(election, 'disqualified', actor, { candidacy: candidacy._id, reason });
  return candidacy;
}

export async function adminCertify(electionId, actor) {
  const election = await Election.findById(electionId);
  if (!election) throw AppError.notFound('Election not found.');
  if (new Date() < election.schedule.votingCloseAt)
    throw new AppError('Voting has not closed yet.', 409, 'VOTING_OPEN');
  return certify(election, actor);
}

export async function auditLog(electionId) {
  const entries = await ElectionAudit.find({ election: electionId }).sort({ createdAt: 1 });
  return entries.map((e) => ({
    action: e.action,
    actor: e.actor.startsWith('player:') ? 'player' : e.actor,
    detail: e.detail,
    at: e.createdAt,
  }));
}

// what any voter in the constituency may see of the audit trail (no admin ids, no dispute notes)
const PUBLIC_DETAIL = new Set(['cancelled', 'disqualified', 'certified', 'voided']);
export async function publicAuditLog(player, electionId) {
  const { election } = await loadForPlayer(player, electionId);
  const record = await StudentRecord.findOne({ player: player._id });
  if (!(await inScope(election.scope, record))) throw AppError.notFound('Election not found.');
  const entries = await ElectionAudit.find({ election: election._id }).sort({ createdAt: 1 });
  return entries.map((e) => ({
    action: e.action,
    actor: e.actor.startsWith('player:')
      ? 'player'
      : e.actor === 'system'
        ? 'system'
        : 'election officer',
    ...(PUBLIC_DETAIL.has(e.action) && e.detail && { detail: e.detail }),
    at: e.createdAt,
  }));
}

export async function removeLeader(assignmentId, reason, actor) {
  const updated = await LeadershipAssignment.findOneAndUpdate(
    { _id: assignmentId, status: 'active' },
    { $set: { status: 'removed', endedReason: reason } },
    { returnDocument: 'after' },
  );
  if (!updated) throw AppError.notFound('No active office with that id.');
  if (updated.election)
    await audit(updated.election, 'leader-removed', actor, { assignment: updated._id, reason });
  return updated;
}
