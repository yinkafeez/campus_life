import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { bus, EVENTS } from '../../core/events.js';
import University from '../universities/university.model.js';
import StudentRecord from '../students/studentRecord.model.js';
import Player from '../players/player.model.js';
import CampusLocation from '../campus/campusLocation.model.js';
import { CampusEvent } from '../community/community.models.js';
import { filterText } from '../moderation/textFilter.js';
import { postOnce } from '../economy/ledger.js';
import { isoWeek } from '../economy/economy.service.js';
import { LeaderAction, LeadershipAssignment } from './elections.models.js';
import { inScope } from './eligibility.js';

/*
 * LEADERSHIP — what elected leaders can do, and nothing more:
 *   announce        post an official announcement to the students IN THEIR SCOPE
 *   official-event  host an official event, visible only inside their scope
 *   welfare-grant   give Campus Coins from a game-funded weekly welfare budget to a
 *                   student in their scope (never themselves; capped per student)
 * Every action checks: an ACTIVE office, the privilege (position or scope default from
 * config.leadership), and that the target lies inside the office's scope — a department
 * leader can't reach another department, a faculty leader another faculty. Leaders get no
 * access to other players' private data, moderation or anything outside these actions.
 */
const trusted = (q) => mongoose.trusted(q);
const DAY = 86_400_000;

const presentOffice = (a) => ({
  id: a._id,
  positionCode: a.positionCode,
  title: a.title,
  scope: { type: a.scope.type, unitName: a.scope.unitName ?? null },
  privileges: a.privileges,
  status: a.status,
  startsAt: a.startsAt,
  endsAt: a.endsAt,
});

/** My offices (with this week's welfare budget left). */
export async function myOffices(player) {
  const offices = await LeadershipAssignment.find({
    player: player._id,
    status: 'active',
    endsAt: trusted({ $gt: new Date() }),
  });
  if (!offices.length) return [];
  const university = await University.findById(offices[0].university);
  const week = isoWeek().label;
  return Promise.all(
    offices.map(async (a) => {
      const spent = await welfareSpent(a._id, week);
      const budget = university.config.leadership.welfareBudgetPerWeek[a.scope.type] ?? 0;
      return {
        ...presentOffice(a),
        welfare: a.privileges.includes('welfare-grant')
          ? { week, budget, left: Math.max(0, budget - spent) }
          : null,
      };
    }),
  );
}

async function welfareSpent(assignmentId, week, recipient) {
  const rows = await LeaderAction.aggregate([
    {
      $match: {
        assignment: assignmentId,
        kind: 'welfare-grant',
        week,
        ...(recipient && { recipient }),
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows[0]?.total ?? 0;
}

/** Load an office of mine that holds this privilege. */
async function officeWith(player, assignmentId, privilege) {
  const office = await LeadershipAssignment.findOne({
    _id: assignmentId,
    player: player._id,
    status: 'active',
    endsAt: trusted({ $gt: new Date() }),
  });
  if (!office) throw AppError.forbidden('You do not hold that office.');
  if (!office.privileges.includes(privilege))
    throw AppError.forbidden('Your office does not include that responsibility.');
  return office;
}

/** Leaders currently in office at my university (who represents me). */
export async function currentLeaders(player) {
  const record = await StudentRecord.findOne({ player: player._id });
  if (!record) return [];
  const offices = await LeadershipAssignment.find({
    university: record.university,
    status: 'active',
    endsAt: trusted({ $gt: new Date() }),
  });
  const mine = [];
  /* eslint-disable no-await-in-loop -- hall checks need a lookup */
  for (const o of offices) if (await inScope(o.scope, record)) mine.push(o);
  /* eslint-enable no-await-in-loop */
  const players = await Player.find({ _id: trusted({ $in: mine.map((o) => o.player) }) }).select(
    'displayName',
  );
  const names = new Map(players.map((p) => [String(p._id), p.displayName]));
  return mine.map((o) => ({
    ...presentOffice(o),
    holder: { playerId: o.player, displayName: names.get(String(o.player)) },
  }));
}

// ─── Announcements ────────────────────────────────────────────────────────
export async function announce(player, assignmentId, { title, body }) {
  const office = await officeWith(player, assignmentId, 'announce');
  const university = await University.findById(office.university);
  const today = await LeaderAction.countDocuments({
    assignment: office._id,
    kind: 'announcement',
    createdAt: trusted({ $gte: new Date(Date.now() - DAY) }),
  });
  if (today >= university.config.leadership.announcementsPerDay) {
    throw new AppError(
      'You have posted the maximum number of announcements for today.',
      429,
      'ANNOUNCEMENT_LIMIT',
    );
  }
  const action = await LeaderAction.create({
    university: office.university,
    assignment: office._id,
    leader: player._id,
    kind: 'announcement',
    scope: office.scope,
    title: filterText(title, { isPublic: true }).text,
    body: filterText(body, { isPublic: true }).text,
  });
  bus.emit(EVENTS.ANNOUNCEMENT, {
    universityId: String(office.university),
    scope: { type: office.scope.type, unit: office.scope.unit ? String(office.scope.unit) : null },
    title: action.title,
    from: { displayName: player.displayName, office: office.title },
  });
  return action;
}

/** Announcements from offices whose scope includes me (newest first). */
export async function myAnnouncements(player) {
  const record = await StudentRecord.findOne({ player: player._id });
  if (!record) return [];
  const actions = await LeaderAction.find({ university: record.university, kind: 'announcement' })
    .sort({ createdAt: -1 })
    .limit(100);
  const out = [];
  /* eslint-disable no-await-in-loop */
  for (const a of actions) if (out.length < 30 && (await inScope(a.scope, record))) out.push(a);
  /* eslint-enable no-await-in-loop */
  const offices = await LeadershipAssignment.find({
    _id: trusted({ $in: out.map((a) => a.assignment) }),
  }).select('title');
  const titles = new Map(offices.map((o) => [String(o._id), o.title]));
  const leaders = await Player.find({ _id: trusted({ $in: out.map((a) => a.leader) }) }).select(
    'displayName',
  );
  const names = new Map(leaders.map((p) => [String(p._id), p.displayName]));
  return out.map((a) => ({
    id: a._id,
    title: a.title,
    body: a.body,
    office: titles.get(String(a.assignment)) ?? null,
    leader: names.get(String(a.leader)) ?? null,
    scope: { type: a.scope.type, unitName: a.scope.unitName ?? null },
    at: a.createdAt,
  }));
}

// ─── Official events ──────────────────────────────────────────────────────
export async function officialEvent(
  player,
  assignmentId,
  { title, description, locationSlug, startsAt, endsAt, capacity },
) {
  const office = await officeWith(player, assignmentId, 'official-event');
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (start.getTime() < Date.now() - 5 * 60_000 || end <= start || end - start > 12 * 3_600_000) {
    throw AppError.badRequest(
      'An official event must start in the future and last at most 12 hours.',
    );
  }
  const location = await CampusLocation.findOne({
    university: office.university,
    slug: locationSlug,
  }).select('world name');
  if (!location?.world) throw AppError.badRequest('Pick a place that is in the game world.');
  const event = await CampusEvent.create({
    university: office.university,
    title: filterText(title, { isPublic: true }).text,
    description: description ? filterText(description, { isPublic: true }).text : undefined,
    kind: 'other',
    host: player._id,
    locationSlug,
    startsAt: start,
    endsAt: end,
    visibility: 'public',
    capacity: capacity ?? 100,
    attendees: [player._id],
    official: { positionCode: office.positionCode, title: office.title, assignment: office._id },
    // only students inside the office's scope see it
    audience: { type: office.scope.type, unit: office.scope.unit },
  });
  await LeaderAction.create({
    university: office.university,
    assignment: office._id,
    leader: player._id,
    kind: 'official-event',
    scope: office.scope,
    title: event.title,
    ref: String(event._id),
  });
  return { id: event._id, title: event.title, location: location.name, startsAt: event.startsAt };
}

// ─── Welfare grants ───────────────────────────────────────────────────────
export async function welfareGrant(
  player,
  assignmentId,
  { recipientId, amount, reason, requestKey },
) {
  const office = await officeWith(player, assignmentId, 'welfare-grant');
  if (String(recipientId) === String(player._id))
    throw AppError.forbidden('Leaders cannot give welfare grants to themselves.');
  const recipient = await Player.findById(recipientId);
  const record = recipient && (await StudentRecord.findOne({ player: recipient._id }));
  if (
    !record ||
    String(record.university) !== String(office.university) ||
    !(await inScope(office.scope, record))
  ) {
    throw AppError.forbidden('You can only support students in your own constituency.');
  }
  const university = await University.findById(office.university);
  const budget = university.config.leadership.welfareBudgetPerWeek[office.scope.type] ?? 0;
  const capPerStudent = university.config.leadership.maxGrantPerStudentPerWeek;
  const week = isoWeek().label;

  // reserve the money first (the action row IS the reservation), then re-check the totals,
  // so two grants at the same moment can't overspend the budget
  const action = await LeaderAction.create({
    university: office.university,
    assignment: office._id,
    leader: player._id,
    kind: 'welfare-grant',
    scope: office.scope,
    recipient: recipient._id,
    amount,
    title: filterText(reason, { isPublic: true }).text,
    ref: requestKey,
    week,
  });
  const [spent, toRecipient] = await Promise.all([
    welfareSpent(office._id, week),
    welfareSpent(office._id, week, recipient._id),
  ]);
  if (spent > budget || toRecipient > capPerStudent) {
    await LeaderAction.deleteOne({ _id: action._id });
    throw new AppError(
      spent > budget
        ? `Your welfare budget this week is ${budget} CC (${Math.max(0, budget - (spent - amount))} left).`
        : `Each student can receive at most ${capPerStudent} CC a week from your office.`,
      409,
      'WELFARE_LIMIT',
    );
  }
  const { duplicate } = await postOnce({
    player: recipient._id,
    amount,
    kind: 'welfare',
    category: 'income',
    description: `Welfare grant from the ${office.title}: ${action.title}`,
    idempotencyKey: `welfare:${office._id}:${requestKey}`,
    ref: { type: 'leader-action', id: String(action._id) },
    actor: `leader:${player._id}`,
  });
  if (duplicate) await LeaderAction.deleteOne({ _id: action._id }); // retry of an earlier grant
  bus.emit(EVENTS.WELFARE_GRANT, {
    toPlayerId: String(recipient._id),
    amount,
    office: office.title,
  });
  return {
    recipient: { playerId: recipient._id, displayName: recipient.displayName },
    amount,
    week,
    left: Math.max(0, budget - spent),
    duplicate,
  };
}

/** Admin/transparency: what an office has done. */
export async function officeActions(assignmentId) {
  return LeaderAction.find({ assignment: assignmentId }).sort({ createdAt: -1 }).limit(200);
}
