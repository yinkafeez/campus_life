import { randomInt } from 'node:crypto';
import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { runAtomic } from '../../core/db/atomic.js';
import InventoryItem from '../wardrobe/inventoryItem.model.js';
import CampusLocation from '../campus/campusLocation.model.js';
import Discovery from '../campus/discovery.model.js';
import { universityOfPlayer } from '../campus/campus.service.js';
import { getEngine } from '../learning/engines/index.js';
import { seededRandom } from '../learning/engines/shared.js';
import { Hustle, Job, Wallet } from './economy.models.js';
import { ensureWallet, postOnce } from './ledger.js';
import { currentEnergy, economySettings, spendEnergy, takeItem } from './economy.service.js';

/*
 * STUDENT HUSTLES — campus jobs that pay Campus Coins.
 *   accept → (tools owned? energy? cooldown? daily cap? stock?) → a job with a task
 *   complete → the server scores the task (learning engines, or a walked delivery route)
 *            → pay = basePay × score%, credited ONCE (idempotency key job:<id>)
 * One active job at a time; energy and stock are spent when the job is accepted.
 */
const trusted = (q) => mongoose.trusted(q);

async function hustleState(player, hustle, rules, { owned, wallet, activeJob }) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [today, last] = await Promise.all([
    Job.countDocuments({
      player: player._id,
      hustle: hustle.key,
      acceptedAt: trusted({ $gte: startOfDay }),
    }),
    Job.findOne({ player: player._id, hustle: hustle.key, status: trusted({ $ne: 'active' }) })
      .sort({ updatedAt: -1 })
      .select('updatedAt'),
  ]);
  const cooldownEndsAt = last
    ? new Date(last.updatedAt.getTime() + hustle.cooldownMinutes * 60_000)
    : null;
  const missingTools = hustle.requires.filter((k) => !(owned.get(k) > 0));
  const missingStock = hustle.consumes
    .filter((c) => !((owned.get(c.itemKey) ?? 0) >= c.quantity))
    .map((c) => c.itemKey);
  const energy = currentEnergy(wallet, rules);
  const blockers = [];
  if (missingTools.length) blockers.push(`Needs: ${missingTools.join(', ')}`);
  if (missingStock.length) blockers.push(`Out of stock: ${missingStock.join(', ')}`);
  if (energy < hustle.energyCost)
    blockers.push(`Needs ${hustle.energyCost} energy (you have ${energy})`);
  if (cooldownEndsAt && cooldownEndsAt > new Date()) blockers.push('Resting after your last job');
  if (today >= hustle.maxJobsPerDay) blockers.push(`Daily limit reached (${hustle.maxJobsPerDay})`);
  if (activeJob && activeJob.hustle !== hustle.key) blockers.push('Finish your current job first');
  return {
    key: hustle.key,
    name: hustle.name,
    category: hustle.category ?? null,
    description: hustle.description ?? null,
    requires: hustle.requires,
    consumes: hustle.consumes,
    energyCost: hustle.energyCost,
    basePay: hustle.basePay,
    passPercent: hustle.passPercent,
    cooldownMinutes: hustle.cooldownMinutes,
    maxJobsPerDay: hustle.maxJobsPerDay,
    jobsToday: today,
    cooldownEndsAt: cooldownEndsAt && cooldownEndsAt > new Date() ? cooldownEndsAt : null,
    activeJobId: activeJob?.hustle === hustle.key ? activeJob._id : null,
    canAccept: blockers.length === 0,
    blockers,
  };
}

export async function listHustles(player) {
  const settings = await economySettings();
  const wallet = await ensureWallet(player._id);
  const [hustles, holdings, activeJob] = await Promise.all([
    Hustle.find({ status: 'active' }).sort({ basePay: 1 }),
    InventoryItem.find({ player: player._id }).select('itemKey quantity'),
    Job.findOne({ player: player._id, open: true }),
  ]);
  const owned = new Map(holdings.map((h) => [h.itemKey, h.quantity ?? 1]));
  return Promise.all(
    hustles.map((h) => hustleState(player, h, settings.rules, { owned, wallet, activeJob })),
  );
}

// ─── Tasks ────────────────────────────────────────────────────────────────
async function buildTask(player, template, seed) {
  if (template.task.type === 'route') {
    const university = await universityOfPlayer(player._id);
    const places = university
      ? await CampusLocation.find({ university: university._id, world: trusted({ $exists: true }) })
          .select('slug name world')
          .sort({ slug: 1 })
      : [];
    if (places.length < 2)
      throw new AppError(
        'Deliveries need a campus with places in the game world.',
        409,
        'NO_ROUTE',
      );
    const rand = seededRandom(seed);
    const a = Math.floor(rand() * places.length);
    let b = Math.floor(rand() * (places.length - 1));
    if (b >= a) b += 1;
    const route = {
      pickup: { slug: places[a].slug, name: places[a].name, zone: places[a].world.zone },
      dropoff: { slug: places[b].slug, name: places[b].name, zone: places[b].world.zone },
    };
    return { view: { type: 'route', ...route }, secret: route };
  }
  const engine = getEngine(template.task.engine);
  const { view, secret } = engine.present(template.task.content, seededRandom(seed));
  return { view: { type: 'engine', engine: template.task.engine, view }, secret };
}

async function scoreTask(player, job, template, answer) {
  if (template.task.type === 'route') {
    const { pickup, dropoff } = job.secret;
    const visits = await Discovery.find({
      player: player._id,
      locationSlug: trusted({ $in: [pickup.slug, dropoff.slug] }),
    }).select('locationSlug lastVisitAt discoveredAt');
    const at = (slug) => {
      const v = visits.find((el) => el.locationSlug === slug);
      return v ? (v.lastVisitAt ?? v.discoveredAt) : null;
    };
    const picked = at(pickup.slug);
    const dropped = at(dropoff.slug);
    const pickedOk = Boolean(picked && picked >= job.acceptedAt);
    const droppedOk = Boolean(
      dropped && dropped >= job.acceptedAt && (!picked || dropped >= picked),
    );
    return {
      score: Number(pickedOk) + Number(pickedOk && droppedOk),
      max: 2,
      feedback: [
        { id: 'pickup', correct: pickedOk, label: `Picked up at ${pickup.name}` },
        { id: 'dropoff', correct: pickedOk && droppedOk, label: `Delivered to ${dropoff.name}` },
      ],
    };
  }
  const engine = getEngine(template.task.engine);
  const parsed = engine.answerSchema.safeParse(answer);
  if (!parsed.success)
    throw AppError.validation(
      parsed.error.issues.map((el) => ({
        path: ['answer', ...el.path].join('.'),
        message: el.message,
      })),
    );
  const { score, max, ...rest } = engine.score(template.task.content, parsed.data, job.secret);
  return { score, max, ...rest };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────
export async function acceptJob(player, hustleKey) {
  const settings = await economySettings();
  const hustle = await Hustle.findOne({ key: hustleKey, status: 'active' });
  if (!hustle) throw AppError.notFound('No such hustle.');
  const existing = await Job.findOne({ player: player._id, open: true });
  if (existing && existing.expiresAt > new Date()) {
    if (existing.hustle !== hustle.key)
      throw new AppError('Finish your current job first.', 409, 'JOB_IN_PROGRESS');
    return resumeJob(player, existing, hustle);
  }
  if (existing)
    await Job.updateOne(
      { _id: existing._id, open: true },
      { $set: { status: 'expired' }, $unset: { open: 1 } },
    );

  const wallet = await ensureWallet(player._id);
  const holdings = await InventoryItem.find({ player: player._id }).select('itemKey quantity');
  const state = await hustleState(player, hustle, settings.rules, {
    owned: new Map(holdings.map((h) => [h.itemKey, h.quantity ?? 1])),
    wallet,
    activeJob: null,
  });
  if (!state.canAccept) throw new AppError(state.blockers[0], 409, 'CANNOT_ACCEPT', state.blockers);

  const seed = randomInt(1, 2 ** 31 - 1);
  const template = hustle.jobs[Math.floor(seededRandom(seed)() * hustle.jobs.length)];
  const { view, secret } = await buildTask(player, template, seed);

  const job = await runAtomic(async (session) => {
    // one active job per player (partial unique index) — created first so a race fails cleanly
    const [created] = await Job.create(
      [
        {
          player: player._id,
          hustle: hustle.key,
          template: template.key,
          open: true,
          seed,
          secret,
          expiresAt: new Date(Date.now() + settings.rules.jobMinutesToComplete * 60_000),
        },
      ],
      { session },
    ).catch((err) => {
      if (err.code === 11000)
        throw new AppError('Finish your current job first.', 409, 'JOB_IN_PROGRESS');
      throw err;
    });
    const undo = [];
    try {
      for (const c of hustle.consumes) {
        // eslint-disable-next-line no-await-in-loop -- few items, each guarded
        if (!(await takeItem(player._id, c.itemKey, c.quantity, session)))
          throw new AppError(`Out of stock: ${c.itemKey}`, 409, 'CANNOT_ACCEPT');
        undo.push(c);
      }
      await spendEnergy(player._id, hustle.energyCost, settings.rules, session);
    } catch (err) {
      if (!session) {
        await Job.deleteOne({ _id: created._id });
        await Promise.all(
          undo.map((c) =>
            InventoryItem.updateOne(
              { player: player._id, itemKey: c.itemKey },
              { $inc: { quantity: c.quantity } },
            ),
          ),
        );
      }
      throw err;
    }
    return created;
  });
  return presentJob(job, hustle, template, view);
}

async function resumeJob(player, job, hustle) {
  const template = hustle.jobs.find((t) => t.key === job.template);
  const { view } = await buildTask(player, template, job.seed);
  return presentJob(job, hustle, template, view);
}

function presentJob(job, hustle, template, view) {
  return {
    job: {
      id: job._id,
      hustle: hustle.key,
      hustleName: hustle.name,
      status: job.status,
      client: template.client,
      brief: template.brief,
      basePay: hustle.basePay,
      passPercent: hustle.passPercent,
      acceptedAt: job.acceptedAt,
      expiresAt: job.expiresAt,
    },
    task: view,
  };
}

export async function getJob(player, jobId) {
  const job = await Job.findOne({ _id: jobId, player: player._id });
  if (!job) throw AppError.notFound('Job not found.');
  const hustle = await Hustle.findOne({ key: job.hustle });
  const template = hustle.jobs.find((t) => t.key === job.template);
  const { view } = await buildTask(player, template, job.seed);
  return {
    ...presentJob(job, hustle, template, view),
    result: job.result ?? null,
    pay: job.pay ?? 0,
  };
}

export async function completeJob(player, jobId, answer) {
  const job = await Job.findOne({ _id: jobId, player: player._id }).select('+secret');
  if (!job) throw AppError.notFound('Job not found.');
  if (!job.open) throw new AppError('This job is already finished.', 409, 'JOB_CLOSED');
  if (job.expiresAt <= new Date()) {
    await Job.updateOne(
      { _id: job._id, open: true },
      { $set: { status: 'expired' }, $unset: { open: 1 } },
    );
    throw new AppError('The client gave up waiting — this job expired.', 409, 'JOB_EXPIRED');
  }
  const hustle = await Hustle.findOne({ key: job.hustle });
  const template = hustle.jobs.find((t) => t.key === job.template);
  const { score, max, ...result } = await scoreTask(player, job, template, answer);
  const percent = max ? Math.round((score / max) * 100) : 0;
  const passed = percent >= hustle.passPercent;
  // route jobs that aren't done yet stay open (walk there, then check again)
  if (template.task.type === 'route' && !passed) {
    return { done: false, result: { score, maxScore: max, percent, passed, ...result }, pay: 0 };
  }
  const pay = passed ? Math.max(1, Math.round((hustle.basePay * percent) / 100)) : 0;

  const closed = await runAtomic(async (session) => {
    const updated = await Job.findOneAndUpdate(
      { _id: job._id, open: true },
      {
        $set: {
          status: passed ? 'completed' : 'failed',
          completedAt: new Date(),
          percent,
          pay,
          result: { score, maxScore: max, percent, passed, ...result },
        },
        $unset: { open: 1 },
      },
      { returnDocument: 'after', session },
    );
    if (!updated) throw new AppError('This job is already finished.', 409, 'JOB_CLOSED');
    if (pay) {
      await postOnce(
        {
          player: player._id,
          amount: pay,
          kind: 'hustle',
          category: 'income',
          description: `${hustle.name}: ${template.client}`,
          idempotencyKey: `job:${job._id}`,
          ref: { type: 'job', id: String(job._id) },
        },
        session,
      );
    }
    return updated;
  });
  const wallet = await Wallet.findOne({ player: player._id });
  return {
    done: true,
    job: { id: closed._id, status: closed.status },
    result: closed.result,
    pay,
    balance: wallet.balance,
  };
}

export async function abandonJob(player, jobId) {
  const res = await Job.updateOne(
    { _id: jobId, player: player._id, open: true },
    { $set: { status: 'abandoned' }, $unset: { open: 1 } },
  );
  if (!res.modifiedCount) throw AppError.notFound('No active job with that id.');
}

export async function recentJobs(player) {
  const jobs = await Job.find({ player: player._id, status: trusted({ $ne: 'active' }) })
    .sort({ updatedAt: -1 })
    .limit(20);
  return jobs.map((j) => ({
    id: j._id,
    hustle: j.hustle,
    status: j.status,
    percent: j.percent ?? null,
    pay: j.pay ?? 0,
    at: j.completedAt ?? j.updatedAt,
  }));
}
