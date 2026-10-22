import { randomInt } from 'node:crypto';
import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import StudentRecord from '../students/studentRecord.model.js';
import University from '../universities/university.model.js';
import { levelLabel } from '../universities/university.config.js';
import Faculty from '../academics/faculty.model.js';
import Department from '../academics/department.model.js';
import Programme from '../academics/programme.model.js';
import { programmeLevels } from '../students/admission.service.js';
import Discovery from '../campus/discovery.model.js';
import ActivityLog from '../campus/activityLog.model.js';
import { filterText } from '../moderation/textFilter.js';
import { getEngine } from './engines/index.js';
import { seededRandom } from './engines/shared.js';
import {
  Achievement,
  ActivityAttempt,
  LearningActivity,
  LearningProgress,
  Mission,
} from './learning.models.js';

/*
 * GAME LEARNING — activities, attempts, XP, missions, achievements and level promotion.
 * Every rule is enforced here on the server; the client only shows what it is given.
 * Game XP is fictional and kept apart from anything that looks like grades or credits.
 */

const trusted = (q) => mongoose.trusted(q);
const STUDYING = ['matriculated', 'active', 'graduated'];
const OPEN_ATTEMPT_HOURS = 24; // untimed attempts stay open this long
const GRACE_SECONDS = 30; // network slack on timed attempts

// ─── Context ──────────────────────────────────────────────────────────────
/** The player's simulated studentship + what they study (codes) + university config. */
export async function learnerContext(player) {
  const record = await StudentRecord.findOne({ player: player._id });
  if (!record)
    throw new AppError('Get admitted to a university to start your studies.', 409, 'NOT_ENROLLED');
  if (!STUDYING.includes(record.status)) {
    throw new AppError(
      'Matriculate first — studies open after matriculation.',
      409,
      'NOT_MATRICULATED',
    );
  }
  const [university, faculty, department, programme] = await Promise.all([
    University.findById(record.university),
    Faculty.findById(record.faculty).select('code name'),
    Department.findById(record.department).select('code name'),
    Programme.findById(record.programme).select('code name durationYears'),
  ]);
  const levels = programmeLevels(university.config, programme).filter(
    (el) => el >= record.entryLevel,
  );
  return {
    record,
    university,
    config: university.config,
    codes: { faculty: faculty.code, department: department.code, programme: programme.code },
    programme,
    level: record.currentLevel,
    levels,
    finalLevel: levels[levels.length - 1],
  };
}

/** Does an activity / mission's targeting include this student? */
export function matchesTargets(targets = {}, { codes, level }) {
  const { faculties = [], departments = [], programmes = [], levels = [] } = targets;
  const scoped = faculties.length || departments.length || programmes.length;
  const inScope =
    !scoped ||
    faculties.includes(codes.faculty) ||
    departments.includes(codes.department) ||
    programmes.includes(codes.programme);
  return inScope && (!levels.length || levels.includes(level));
}

/** The player's progress document, with an entry for their current level. */
async function ensureProgress(player, ctx) {
  const scope = { player: player._id, university: ctx.university._id };
  await LearningProgress.updateOne(scope, { $setOnInsert: scope }, { upsert: true }).catch(
    (err) => {
      if (err.code !== 11000) throw err; // created by a parallel request
    },
  );
  await LearningProgress.updateOne(
    { ...scope, 'levels.level': trusted({ $ne: ctx.level }) },
    {
      $push: {
        levels: {
          level: ctx.level,
          startedAt: new Date(),
          xp: 0,
          best: {},
          passed: [],
          missions: [],
        },
      },
    },
  );
  return LearningProgress.findOne(scope);
}

const levelEntry = (progress, level) => progress.levels.find((el) => el.level === level);
const xpMultiplier = (config, difficulty) =>
  config.progression.difficultyMultipliers[difficulty] ?? 1;

// ─── Activities ───────────────────────────────────────────────────────────
function activityWindow(activity, levelInfo, now = new Date()) {
  const dueAt =
    activity.dueDays && levelInfo
      ? new Date(levelInfo.startedAt.getTime() + activity.dueDays * 86_400_000)
      : null;
  if (activity.opensAt && now < activity.opensAt)
    return { open: false, reason: 'Opens later.', dueAt };
  if (activity.closesAt && now > activity.closesAt)
    return { open: false, reason: 'This activity has closed.', dueAt };
  return { open: true, reason: null, dueAt, late: Boolean(dueAt && now > dueAt) };
}

function presentActivity(activity, ctx, { levelInfo, attemptsUsed = 0, openAttempt = null } = {}) {
  const engine = getEngine(activity.engine);
  const best = levelInfo?.best?.[activity.key] ?? null;
  const window = activityWindow(activity, levelInfo);
  const attemptsLeft = Math.max(0, activity.limits.maxAttempts - attemptsUsed);
  return {
    key: activity.key,
    title: activity.title,
    summary: activity.summary ?? null,
    discipline: activity.discipline ?? null,
    engine: activity.engine,
    format: engine.label,
    difficulty: activity.difficulty,
    xp: Math.round(activity.rewards.xp * xpMultiplier(ctx.config, activity.difficulty)),
    passPercent: activity.scoring.passPercent,
    maxAttempts: activity.limits.maxAttempts,
    timeLimitSeconds: activity.limits.timeLimitSeconds ?? null,
    location: activity.location ?? null,
    notice: activity.notice ?? null,
    dueAt: window.dueAt,
    opensAt: activity.opensAt ?? null,
    closesAt: activity.closesAt ?? null,
    state: {
      available: window.open && (attemptsLeft > 0 || Boolean(openAttempt)),
      reason:
        window.reason ??
        (attemptsLeft === 0 && !openAttempt ? 'No attempts left at this level.' : null),
      late: Boolean(window.late),
      attemptsUsed,
      attemptsLeft,
      openAttemptId: openAttempt?._id ?? null,
      best: best ? { percent: best.percent, passed: best.passed, xp: best.xp } : null,
    },
  };
}

async function attemptCounts(player, level) {
  const rows = await ActivityAttempt.aggregate([
    { $match: { player: player._id, level } },
    { $group: { _id: '$activityKey', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((el) => [el._id, el.n]));
}

/** Activities for my programme and level, with my standing on each. */
export async function listActivities(player) {
  const ctx = await learnerContext(player);
  const progress = await ensureProgress(player, ctx);
  const levelInfo = levelEntry(progress, ctx.level);
  const [activities, counts, open] = await Promise.all([
    LearningActivity.find({ university: ctx.university._id, status: 'active' }).sort({
      discipline: 1,
      title: 1,
    }),
    attemptCounts(player, ctx.level),
    ActivityAttempt.find({ player: player._id, open: true }).select('activityKey expiresAt'),
  ]);
  const openBy = new Map(
    open.filter((a) => a.expiresAt > new Date()).map((a) => [a.activityKey, a]),
  );
  return activities
    .filter((a) => matchesTargets(a.targets, ctx))
    .map((a) =>
      presentActivity(a, ctx, {
        levelInfo,
        attemptsUsed: counts.get(a.key) ?? 0,
        openAttempt: openBy.get(a.key),
      }),
    );
}

async function findActivityFor(ctx, key) {
  const activity = await LearningActivity.findOne({
    university: ctx.university._id,
    key,
    status: 'active',
  });
  if (!activity || !matchesTargets(activity.targets, ctx))
    throw AppError.notFound('That activity is not part of your studies.');
  return activity;
}

export async function getActivity(player, key) {
  const ctx = await learnerContext(player);
  const activity = await findActivityFor(ctx, key);
  const progress = await ensureProgress(player, ctx);
  const attempts = await ActivityAttempt.find({
    player: player._id,
    activity: activity._id,
    level: ctx.level,
  }).sort({ number: 1 });
  const open = attempts.find((a) => a.open && a.expiresAt > new Date());
  return {
    activity: presentActivity(activity, ctx, {
      levelInfo: levelEntry(progress, ctx.level),
      attemptsUsed: attempts.length,
      openAttempt: open,
    }),
    attempts: attempts.map(presentAttempt),
  };
}

function presentAttempt(a) {
  return {
    id: a._id,
    number: a.number,
    level: a.level,
    status: a.open && a.expiresAt <= new Date() ? 'expired' : a.status,
    startedAt: a.startedAt,
    expiresAt: a.expiresAt,
    submittedAt: a.submittedAt ?? null,
    score: a.score ?? null,
    maxScore: a.maxScore ?? null,
    percent: a.percent ?? null,
    passed: a.passed ?? null,
    late: a.late ?? false,
    xpAwarded: a.xpAwarded ?? 0,
  };
}

const viewFor = (activity, seed) =>
  getEngine(activity.engine).present(activity.content, seededRandom(seed));

/** Start (or resume) an attempt. Returns the attempt and what to show — never the answers. */
export async function startAttempt(player, key) {
  const ctx = await learnerContext(player);
  const activity = await findActivityFor(ctx, key);
  const progress = await ensureProgress(player, ctx);
  const window = activityWindow(activity, levelEntry(progress, ctx.level));
  if (!window.open) throw new AppError(window.reason, 409, 'ACTIVITY_CLOSED');

  // resume an attempt that's still running; close one that ran out of time
  const existing = await ActivityAttempt.findOne({
    player: player._id,
    activity: activity._id,
    open: true,
  });
  if (existing && existing.expiresAt > new Date()) {
    return {
      attempt: presentAttempt(existing),
      view: viewFor(activity, existing.seed).view,
      resumed: true,
    };
  }
  if (existing) await expire(existing._id);

  const used = await ActivityAttempt.countDocuments({
    player: player._id,
    activity: activity._id,
    level: ctx.level,
  });
  if (used >= activity.limits.maxAttempts) {
    throw new AppError(
      'No attempts left for this activity at your level.',
      409,
      'NO_ATTEMPTS_LEFT',
    );
  }

  const seed = randomInt(1, 2 ** 31 - 1);
  const { view, secret } = viewFor(activity, seed);
  const limit = activity.limits.timeLimitSeconds;
  const now = Date.now();
  try {
    const attempt = await ActivityAttempt.create({
      player: player._id,
      university: ctx.university._id,
      activity: activity._id,
      activityKey: activity.key,
      level: ctx.level,
      number: used + 1,
      open: true,
      seed,
      secret,
      expiresAt: new Date(
        now + (limit ? (limit + GRACE_SECONDS) * 1000 : OPEN_ATTEMPT_HOURS * 3_600_000),
      ),
      dueAt: window.dueAt ?? undefined,
    });
    return { attempt: presentAttempt(attempt), view, resumed: false };
  } catch (err) {
    if (err.code !== 11000) throw err;
    // a parallel "start" won: hand back that attempt
    const winner = await ActivityAttempt.findOne({
      player: player._id,
      activity: activity._id,
      open: true,
    });
    if (!winner) throw new AppError('Please try again.', 409, 'ATTEMPT_RACE');
    return {
      attempt: presentAttempt(winner),
      view: viewFor(activity, winner.seed).view,
      resumed: true,
    };
  }
}

const expire = (id) =>
  ActivityAttempt.updateOne(
    { _id: id, open: true },
    { $set: { status: 'expired' }, $unset: { open: 1 } },
  );

/** Submit an attempt: score on the server, award XP for improvement only, then re-check missions. */
export async function submitAttempt(player, attemptId, rawAnswer) {
  const attempt = await ActivityAttempt.findOne({ _id: attemptId, player: player._id }).select(
    '+secret',
  );
  if (!attempt) throw AppError.notFound('Attempt not found.');
  if (!attempt.open) throw new AppError('This attempt is already finished.', 409, 'ATTEMPT_CLOSED');
  if (attempt.expiresAt <= new Date()) {
    await expire(attempt._id);
    throw new AppError('Time is up for this attempt.', 409, 'ATTEMPT_EXPIRED');
  }

  const activity = await LearningActivity.findById(attempt.activity);
  const engine = getEngine(activity.engine);
  const parsed = engine.answerSchema.safeParse(rawAnswer);
  if (!parsed.success) {
    throw AppError.validation(
      parsed.error.issues.map((el) => ({
        path: ['answer', ...el.path].join('.'),
        message: el.message,
      })),
    );
  }
  const answer =
    activity.engine === 'written' ? { text: filterText(parsed.data.text).text } : parsed.data;

  const { score, max, ...result } = engine.score(activity.content, answer, attempt.secret);
  const percent = max ? Math.round((score / max) * 100) : 0;
  const passed = percent >= activity.scoring.passPercent;
  const now = new Date();
  const late = Boolean(attempt.dueAt && now > attempt.dueAt);

  const ctx = await learnerContext(player);
  const progress = await ensureProgress(player, ctx);
  const levelInfo = levelEntry(progress, attempt.level) ?? levelEntry(progress, ctx.level);
  const prevBest = levelInfo?.best?.[activity.key] ?? { percent: 0, xp: 0, passed: false };
  const lateFactor = late ? 1 - ctx.config.progression.latePenaltyPercent / 100 : 1;
  const potentialXp = passed
    ? Math.round(
        activity.rewards.xp *
          xpMultiplier(ctx.config, activity.difficulty) *
          (percent / 100) *
          lateFactor,
      )
    : 0;
  // XP comes from improving your best at this level — repeating the same score earns nothing
  const xpAwarded = Math.max(0, potentialXp - (prevBest.xp ?? 0));

  // close the attempt exactly once (a double click can't score twice)
  const closed = await ActivityAttempt.findOneAndUpdate(
    { _id: attempt._id, open: true },
    {
      $set: {
        status: 'submitted',
        submittedAt: now,
        answer,
        score,
        maxScore: max,
        percent,
        passed,
        late,
        xpAwarded,
        result,
      },
      $unset: { open: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!closed) throw new AppError('This attempt is already finished.', 409, 'ATTEMPT_CLOSED');

  const better = percent > (prevBest.percent ?? 0) || potentialXp > (prevBest.xp ?? 0);
  const update = { $inc: { totalXp: xpAwarded, 'levels.$.xp': xpAwarded } };
  if (better) {
    update.$set = {
      [`levels.$.best.${activity.key}`]: {
        percent: Math.max(percent, prevBest.percent ?? 0),
        xp: Math.max(potentialXp, prevBest.xp ?? 0),
        passed: passed || Boolean(prevBest.passed),
      },
    };
  }
  if (passed) update.$addToSet = { 'levels.$.passed': activity.key };
  if (percent === 100 && (prevBest.percent ?? 0) < 100) update.$inc.perfectScores = 1;
  await LearningProgress.updateOne({ _id: progress._id, 'levels.level': levelInfo.level }, update);

  const { missions, achievements } = await evaluateProgress(player, ctx);
  return {
    attempt: presentAttempt(closed),
    result: {
      score,
      maxScore: max,
      percent,
      passed,
      passPercent: activity.scoring.passPercent,
      late,
      xpAwarded,
      ...result,
    },
    missionsCompleted: missions,
    achievementsEarned: achievements,
  };
}

export async function recentAttempts(player, limit = 20) {
  const attempts = await ActivityAttempt.find({ player: player._id, status: 'submitted' })
    .sort({ submittedAt: -1 })
    .limit(limit);
  const titles = new Map(
    (
      await LearningActivity.find({
        _id: trusted({ $in: attempts.map((a) => a.activity) }),
      }).select('title')
    ).map((a) => [String(a._id), a.title]),
  );
  return attempts.map((a) => ({
    ...presentAttempt(a),
    activityKey: a.activityKey,
    title: titles.get(String(a.activity)) ?? a.activityKey,
  }));
}

// ─── Missions & achievements ──────────────────────────────────────────────
async function missionFacts(player, ctx) {
  const [discoveries, logs] = await Promise.all([
    Discovery.find({ player: player._id, university: ctx.university._id }).select('locationSlug'),
    ActivityLog.find({ player: player._id, university: ctx.university._id }).select(
      'locationSlug activityKey',
    ),
  ]);
  return {
    discovered: new Set(discoveries.map((d) => d.locationSlug)),
    campusDone: new Set(logs.map((l) => `${l.locationSlug}/${l.activityKey}`)),
    onboarded: Boolean(ctx.record.onboarding?.completedAt),
  };
}

function missionStatus(mission, ctx, progress, facts) {
  const current = levelEntry(progress, ctx.level);
  const passedHere = new Set(current?.passed ?? []);
  const passedEver = new Set(progress.levels.flatMap((l) => l.passed));
  const passed = mission.perLevel ? passedHere : passedEver;

  const steps = mission.steps.map((step) => {
    let have = 0;
    let need = 1;
    if (step.type === 'pass-activity') have = passed.has(step.ref) ? 1 : 0;
    if (step.type === 'pass-activities') [have, need] = [passed.size, step.count];
    if (step.type === 'discover-location') have = facts.discovered.has(step.ref) ? 1 : 0;
    if (step.type === 'discover-locations') [have, need] = [facts.discovered.size, step.count];
    if (step.type === 'campus-activity') have = facts.campusDone.has(step.ref) ? 1 : 0;
    if (step.type === 'onboarding-complete') have = facts.onboarded ? 1 : 0;
    return {
      key: step.key,
      label: step.label,
      type: step.type,
      ref: step.ref ?? null,
      have: Math.min(have, need),
      need,
      done: have >= need,
    };
  });

  const completedHere = (current?.missions ?? []).includes(mission.key);
  const completedEver = progress.missionsCompleted.some((m) => m.key === mission.key);
  return {
    key: mission.key,
    title: mission.title,
    summary: mission.summary ?? null,
    xp: mission.rewards.xp,
    requiredForPromotion: mission.requiredForPromotion,
    perLevel: mission.perLevel,
    steps,
    complete: mission.perLevel ? completedHere : completedEver,
    ready: steps.every((s) => s.done),
  };
}

/** Record newly completed missions (XP once) and newly earned achievements. */
async function evaluateProgress(player, ctx) {
  let progress = await ensureProgress(player, ctx);
  const [missions, facts] = await Promise.all([
    Mission.find({ university: ctx.university._id, status: 'active' }),
    missionFacts(player, ctx),
  ]);
  const completed = [];
  /* eslint-disable no-await-in-loop -- each completion is a guarded atomic write */
  for (const mission of missions.filter((m) => matchesTargets(m.targets, ctx))) {
    const status = missionStatus(mission, ctx, progress, facts);
    if (status.complete || !status.ready) continue;
    const guard = mission.perLevel
      ? {
          missionsCompleted: trusted({
            $not: { $elemMatch: { key: mission.key, level: ctx.level } },
          }),
        }
      : { 'missionsCompleted.key': trusted({ $ne: mission.key }) };
    const res = await LearningProgress.updateOne(
      { _id: progress._id, 'levels.level': ctx.level, ...guard },
      {
        $push: {
          missionsCompleted: { key: mission.key, level: ctx.level, completedAt: new Date() },
        },
        $addToSet: { 'levels.$.missions': mission.key },
        $inc: { totalXp: mission.rewards.xp, 'levels.$.xp': mission.rewards.xp },
      },
    );
    if (res.modifiedCount)
      completed.push({ key: mission.key, title: mission.title, xp: mission.rewards.xp });
  }
  if (completed.length) progress = await LearningProgress.findById(progress._id);

  const counts = {
    'activities-passed': progress.levels.reduce((sum, l) => sum + l.passed.length, 0),
    'perfect-scores': progress.perfectScores,
    'missions-completed': progress.missionsCompleted.length,
    'total-xp': progress.totalXp,
    'levels-completed': progress.levels.filter((l) => l.completedAt).length,
  };
  const earnedKeys = new Set(progress.achievements.map((a) => a.key));
  const achievements = await Achievement.find({ university: ctx.university._id, status: 'active' });
  const earned = [];
  for (const a of achievements) {
    if (earnedKeys.has(a.key) || counts[a.criteria.type] < a.criteria.count) continue;
    const res = await LearningProgress.updateOne(
      { _id: progress._id, 'achievements.key': trusted({ $ne: a.key }) },
      { $push: { achievements: { key: a.key, awardedAt: new Date() } } },
    );
    if (res.modifiedCount)
      earned.push({ key: a.key, title: a.title, description: a.description ?? null });
  }
  /* eslint-enable no-await-in-loop */
  return { missions: completed, achievements: earned };
}

export async function listMissions(player) {
  const ctx = await learnerContext(player);
  await evaluateProgress(player, ctx);
  const progress = await ensureProgress(player, ctx);
  const [missions, facts] = await Promise.all([
    Mission.find({ university: ctx.university._id, status: 'active' }).sort({
      requiredForPromotion: -1,
      title: 1,
    }),
    missionFacts(player, ctx),
  ]);
  return missions
    .filter((m) => matchesTargets(m.targets, ctx))
    .map((m) => missionStatus(m, ctx, progress, facts));
}

export async function listAchievements(player) {
  const ctx = await learnerContext(player);
  const progress = await ensureProgress(player, ctx);
  const earned = new Map(progress.achievements.map((a) => [a.key, a.awardedAt]));
  const achievements = await Achievement.find({
    university: ctx.university._id,
    status: 'active',
  }).sort({ 'criteria.count': 1 });
  return achievements.map((a) => ({
    key: a.key,
    title: a.title,
    description: a.description ?? null,
    criteria: a.criteria,
    earned: earned.has(a.key),
    awardedAt: earned.get(a.key) ?? null,
  }));
}

// ─── Standing & promotion ─────────────────────────────────────────────────
async function requirements(player, ctx, progress) {
  const rules = ctx.config.progression.promotion;
  const current = levelEntry(progress, ctx.level);
  const missions = rules.requireMissions
    ? (
        await Mission.find({
          university: ctx.university._id,
          status: 'active',
          requiredForPromotion: true,
        })
      )
        .filter((m) => matchesTargets(m.targets, ctx))
        .map((m) => {
          const done = m.perLevel
            ? (current?.missions ?? []).includes(m.key)
            : progress.missionsCompleted.some((x) => x.key === m.key);
          return { key: m.key, title: m.title, done };
        })
    : [];
  const list = [
    {
      key: 'xp',
      label: `Earn ${rules.minXp} game XP at this level`,
      have: current?.xp ?? 0,
      need: rules.minXp,
    },
    {
      key: 'passed',
      label: `Pass ${rules.minPassedActivities} activities at this level`,
      have: current?.passed.length ?? 0,
      need: rules.minPassedActivities,
    },
    ...missions.map((m) => ({
      key: `mission:${m.key}`,
      label: `Complete the mission “${m.title}”`,
      have: m.done ? 1 : 0,
      need: 1,
    })),
  ];
  if (rules.requireOnboarding) {
    list.push({
      key: 'onboarding',
      label: 'Finish fresher onboarding',
      have: ctx.record.onboarding?.completedAt ? 1 : 0,
      need: 1,
    });
  }
  return list.map((r) => ({ ...r, have: Math.min(r.have, r.need), done: r.have >= r.need }));
}

export async function getStanding(player) {
  const ctx = await learnerContext(player);
  await evaluateProgress(player, ctx);
  const progress = await ensureProgress(player, ctx);
  const current = levelEntry(progress, ctx.level);
  const graduated = ctx.record.status === 'graduated';
  const reqs = graduated ? [] : await requirements(player, ctx, progress);
  const index = ctx.levels.indexOf(ctx.level);
  const next = ctx.levels[index + 1] ?? null;
  return {
    isSimulated: true,
    disclaimer: ctx.config.progression.disclaimer,
    status: ctx.record.status,
    level: { level: ctx.level, label: levelLabel(ctx.config, ctx.level) },
    nextLevel: next ? { level: next, label: levelLabel(ctx.config, next) } : null,
    isFinalLevel: !next,
    levelXp: current?.xp ?? 0,
    totalXp: progress.totalXp,
    passedAtLevel: current?.passed.length ?? 0,
    requirements: reqs,
    canAdvance: !graduated && reqs.every((r) => r.done),
    graduatedAt: ctx.record.graduatedAt ?? null,
    history: progress.levels.map((l) => ({
      level: l.level,
      label: levelLabel(ctx.config, l.level),
      xp: l.xp,
      passed: l.passed.length,
      completedAt: l.completedAt ?? null,
    })),
  };
}

/** Move up a level (or graduate from the final one) when every requirement is met. */
export async function advanceLevel(player) {
  const ctx = await learnerContext(player);
  if (ctx.record.status === 'graduated')
    throw new AppError('You have already graduated in the game.', 409, 'ALREADY_GRADUATED');
  await evaluateProgress(player, ctx);
  const progress = await ensureProgress(player, ctx);
  const reqs = await requirements(player, ctx, progress);
  const missing = reqs.filter((r) => !r.done);
  if (missing.length) {
    throw new AppError(
      'You have not met the requirements for this level yet.',
      409,
      'REQUIREMENTS_NOT_MET',
      missing,
    );
  }
  if (ctx.config.progression.promotion.requireOnboarding && ctx.record.status !== 'active') {
    throw new AppError('Finish fresher onboarding first.', 409, 'REQUIREMENTS_NOT_MET');
  }

  const index = ctx.levels.indexOf(ctx.level);
  const next = ctx.levels[index + 1];
  const now = new Date();
  // guarded on the current level, so a double click can't skip two levels
  const set = next ? { currentLevel: next } : { status: 'graduated', graduatedAt: now };
  const moved = await StudentRecord.findOneAndUpdate(
    {
      _id: ctx.record._id,
      currentLevel: ctx.level,
      status: trusted({ $in: ['matriculated', 'active'] }),
    },
    { $set: set },
    { returnDocument: 'after' },
  );
  if (!moved)
    throw new AppError(
      'Your level changed in the meantime. Refresh and try again.',
      409,
      'LEVEL_CHANGED',
    );

  await LearningProgress.updateOne(
    { _id: progress._id, 'levels.level': ctx.level },
    { $set: { 'levels.$.completedAt': now } },
  );
  const nextCtx = { ...ctx, record: moved, level: moved.currentLevel };
  if (next) await ensureProgress(player, nextCtx);
  const { achievements } = await evaluateProgress(player, nextCtx);
  return {
    graduated: !next,
    from: { level: ctx.level, label: levelLabel(ctx.config, ctx.level) },
    to: next ? { level: next, label: levelLabel(ctx.config, next) } : null,
    achievementsEarned: achievements,
  };
}
