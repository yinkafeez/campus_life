/* eslint-disable no-await-in-loop -- bed claims and ballot draws must run one at a time */
import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import AcademicSession from '../academics/academicSession.model.js';
import Programme from '../academics/programme.model.js';
import StudentRecord from '../students/studentRecord.model.js';
import University from '../universities/university.model.js';
import User from '../auth/user.model.js';
import Player from '../players/player.model.js';
import { playerCard } from '../social/social.service.js';
import Hostel from './hostel.model.js';
import AccommodationAssignment from './assignment.model.js';

/*
 * HOSTELS (simulated) — eligibility, bed spaces, ballots and roommates.
 * Every rule comes from the hostel's record and the university's accommodation config:
 *   - only matriculated students; the hostel's residentGender must fit the player's gender
 *   - residentType (game students are undergraduates for now) and eligibleLevels
 *   - a hostel needs a roomPlan (rooms × beds) to take players; capacity = rooms × beds
 *   - allocation.mode "direct" → a free bed now; "ballot" → apply, then the draw allocates
 *   - the draw order follows config.accommodation.allocationStrategy
 *     (first-come | lottery | priority, where freshers/finalists are the groups we can compute)
 */

const HOLDING = ['applied', 'active'];
const CLAIM_RETRIES = 6;
const STUDENT_STATUSES_ALLOWED = ['matriculated', 'active'];

async function studentContext(player) {
  const record = await StudentRecord.findOne({ player: player._id });
  if (!record) throw new AppError('Enrol at a university first.', 409, 'NOT_ENROLLED');
  const [university, programme] = await Promise.all([
    University.findById(record.university),
    Programme.findById(record.programme).select('durationYears'),
  ]);
  return { record, university, programme };
}

const capacityOf = (hostel) =>
  hostel.roomPlan?.rooms && hostel.roomPlan?.bedsPerRoom
    ? hostel.roomPlan.rooms * hostel.roomPlan.bedsPerRoom
    : 0;

/** Why this player can't live in this hostel ([] = eligible). */
export function eligibilityProblems(hostel, { player, record }) {
  const problems = [];
  if (!STUDENT_STATUSES_ALLOWED.includes(record.status))
    problems.push('Only matriculated students can get a bed space.');
  if (!capacityOf(hostel)) problems.push('This hall is not open to players yet.');
  if (hostel.residentGender !== 'mixed') {
    if (!player.gender) problems.push('Set your character gender in your profile first.');
    else if (player.gender !== hostel.residentGender)
      problems.push(`This is a ${hostel.residentGender} hall.`);
  }
  if (hostel.residentType === 'postgraduate')
    problems.push('This hall is for postgraduate students.');
  const levels = hostel.allocation?.eligibleLevels ?? [];
  if (levels.length && !levels.includes(record.currentLevel)) {
    problems.push(`Open to ${levels.join(', ')} level students only.`);
  }
  return problems;
}

async function bedsTaken(hostelId) {
  return AccommodationAssignment.countDocuments({ hostel: hostelId, status: 'active' });
}

/** Hostels at the player's university with what they can do at each. */
export async function listHostelsFor(player) {
  const { record, university } = await studentContext(player);
  const hostels = await Hostel.find({ university: university._id })
    .select(
      'slug name aliases residentGender residentType allocation roomPlan accessRules verification',
    )
    .populate('location', 'slug name')
    .sort({ name: 1 })
    .lean();
  const taken = await AccommodationAssignment.aggregate([
    { $match: { university: university._id, status: 'active' } },
    { $group: { _id: '$hostel', n: { $sum: 1 } } },
  ]);
  const takenBy = new Map(taken.map((el) => [String(el._id), el.n]));

  return {
    rules: university.config.accommodation,
    hostels: hostels.map((hostel) => {
      const capacity = capacityOf(hostel);
      const problems = eligibilityProblems(hostel, { player, record });
      return {
        ...hostel,
        mode: hostel.allocation?.mode ?? 'ballot',
        capacity,
        bedsLeft: Math.max(0, capacity - (takenBy.get(String(hostel._id)) ?? 0)),
        eligible: problems.length === 0,
        problems,
      };
    }),
  };
}

/** Claim a random free bed atomically (the unique bed index settles races). */
async function claimBed(assignment, hostel) {
  const { rooms, bedsPerRoom } = hostel.roomPlan;
  for (let attempt = 0; attempt < CLAIM_RETRIES; attempt += 1) {
    const occupied = await AccommodationAssignment.find({ hostel: hostel._id, status: 'active' })
      .select('room bed')
      .lean();
    const used = new Set(occupied.map((el) => `${el.room}:${el.bed}`));
    // fill rooms in order so roommates actually meet; random bed inside the first room with space
    let choice = null;
    for (let room = 1; room <= rooms && !choice; room += 1) {
      const free = [];
      for (let bed = 1; bed <= bedsPerRoom; bed += 1)
        if (!used.has(`${room}:${bed}`)) free.push(bed);
      if (free.length) choice = { room, bed: free[Math.floor(Math.random() * free.length)] };
    }
    if (!choice) return null;
    try {
      assignment.set({
        status: 'active',
        holding: true,
        room: choice.room,
        bed: choice.bed,
        allocatedAt: new Date(),
      });
      await assignment.save();
      return assignment;
    } catch (err) {
      if (err.code !== 11000 || !String(err.message).includes('one_player_per_bed')) throw err;
      // someone took that bed a moment ago — look again
    }
  }
  throw AppError.unavailable('The hall is busy right now. Try again.', 'ALLOCATION_BUSY');
}

/** Apply for / book a bed. Returns the assignment (status active, or applied for ballots). */
export async function requestBed(player, hostelSlug) {
  const context = await studentContext(player);
  const hostel = await Hostel.findOne({ university: context.university._id, slug: hostelSlug });
  if (!hostel) throw AppError.notFound('No hostel found with that slug.');
  const problems = eligibilityProblems(hostel, { player, record: context.record });
  if (problems.length) throw new AppError(problems[0], 403, 'NOT_ELIGIBLE', problems);

  const mode = hostel.allocation?.mode ?? 'ballot';
  const current = await AccommodationAssignment.findOne({ player: player._id, holding: true });
  if (current)
    throw new AppError('You already have a bed space or an application.', 409, 'ALREADY_HOUSED');
  if (mode === 'direct' && (await bedsTaken(hostel._id)) >= capacityOf(hostel)) {
    throw new AppError('This hall is full.', 409, 'HOSTEL_FULL');
  }

  const session = await AcademicSession.findOne({
    university: context.university._id,
    isCurrent: true,
  }).select('_id');
  let assignment;
  try {
    assignment = await AccommodationAssignment.create({
      player: player._id,
      university: context.university._id,
      hostel: hostel._id,
      session: session?._id,
      status: 'applied',
      holding: true,
      via: mode,
    });
  } catch (err) {
    if (err.code === 11000)
      throw new AppError('You already have a bed space or an application.', 409, 'ALREADY_HOUSED');
    throw err;
  }
  if (mode === 'ballot') return assignment;

  const claimed = await claimBed(assignment, hostel);
  if (!claimed) {
    await AccommodationAssignment.deleteOne({ _id: assignment._id });
    throw new AppError('This hall is full.', 409, 'HOSTEL_FULL');
  }
  return claimed;
}

/** Move out of a bed, or withdraw an application. */
export async function vacate(player) {
  const current = await AccommodationAssignment.findOneAndUpdate(
    { player: player._id, holding: true },
    { $set: { status: 'vacated', endedAt: new Date() }, $unset: { holding: 1 } },
    { returnDocument: 'after' },
  );
  if (!current) throw AppError.notFound('You have no bed space or application.');
  return current;
}

/** My bed (or application) with the hostel and roommates. */
export async function myAccommodation(player) {
  const assignment = await AccommodationAssignment.findOne({
    player: player._id,
    status: mongoose.trusted({ $in: [...HOLDING, 'unsuccessful'] }),
  })
    .sort({ updatedAt: -1 })
    .populate('hostel', 'slug name residentGender accessRules location');
  if (!assignment) return { assignment: null, roommates: [] };

  let roommates = [];
  if (assignment.status === 'active') {
    const mates = await AccommodationAssignment.find({
      hostel: assignment.hostel._id,
      room: assignment.room,
      status: 'active',
      player: mongoose.trusted({ $ne: player._id }),
    }).select('player bed');
    const players = await Player.find({
      _id: mongoose.trusted({ $in: mates.map((el) => el.player) }),
    });
    const users = await User.find({
      _id: mongoose.trusted({ $in: players.map((el) => el.user) }),
    }).select('username');
    const names = new Map(users.map((el) => [String(el._id), el.username]));
    const bedOf = new Map(mates.map((el) => [String(el.player), el.bed]));
    roommates = players.map((el) =>
      playerCard(el, names.get(String(el.user)), { bed: bedOf.get(String(el._id)) }),
    );
  }
  return {
    assignment: {
      id: assignment._id,
      status: assignment.status,
      via: assignment.via,
      hostel: assignment.hostel,
      room: assignment.room ?? null,
      bed: assignment.bed ?? null,
      allocatedAt: assignment.allocatedAt ?? null,
      isSimulated: true,
    },
    roommates,
  };
}

// ─── Ballot draw (admin) ──────────────────────────────────────────────────
const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

async function drawOrder(applications, strategy, priorityGroups) {
  if (strategy === 'first-come') return [...applications].sort((a, b) => a.createdAt - b.createdAt);
  const shuffled = shuffle(applications);
  if (strategy !== 'priority' || !priorityGroups.length) return shuffled;

  const records = await StudentRecord.find({
    player: mongoose.trusted({ $in: applications.map((el) => el.player) }),
  })
    .select('player entryLevel currentLevel programme')
    .populate('programme', 'durationYears');
  const byPlayer = new Map(records.map((el) => [String(el.player), el]));
  // the groups the game can work out from a student record; others never match (yet)
  const inGroup = (group, rec) => {
    if (!rec) return false;
    if (group === 'freshers') return rec.currentLevel === rec.entryLevel;
    if (group === 'finalists')
      return rec.programme?.durationYears && rec.currentLevel >= rec.programme.durationYears * 100;
    return false;
  };
  const rank = (app) => {
    const rec = byPlayer.get(String(app.player));
    const index = priorityGroups.findIndex((group) => inGroup(group, rec));
    return index === -1 ? priorityGroups.length : index;
  };
  return shuffled.sort((a, b) => rank(a) - rank(b)); // stable: random within each group
}

/** Run a hostel's ballot: allocate beds to applicants in strategy order; the rest are unsuccessful. */
export async function drawBallot(university, hostelSlug) {
  const hostel = await Hostel.findOne({ university: university._id, slug: hostelSlug });
  if (!hostel) throw AppError.notFound('No hostel found with that slug.');
  if (!capacityOf(hostel)) throw AppError.badRequest('This hall has no room plan.');

  const applications = await AccommodationAssignment.find({
    hostel: hostel._id,
    status: 'applied',
  });
  const { allocationStrategy, priorityGroups } = university.config.accommodation;
  const ordered = await drawOrder(applications, allocationStrategy, priorityGroups ?? []);

  const result = {
    applicants: ordered.length,
    allocated: 0,
    unsuccessful: 0,
    strategy: allocationStrategy,
  };
  for (const application of ordered) {
    const claimed =
      (await bedsTaken(hostel._id)) < capacityOf(hostel)
        ? await claimBed(application, hostel)
        : null;
    if (claimed) {
      result.allocated += 1;
    } else {
      application.set({ status: 'unsuccessful', holding: undefined, endedAt: new Date() });
      await application.save();
      result.unsuccessful += 1;
    }
  }
  return result;
}
