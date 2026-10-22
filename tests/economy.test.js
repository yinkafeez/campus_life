import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { closeTestDb, connectTestDb } from './helpers/db.js';
import { makePlayer } from './helpers/players.js';
import { importSeeds } from '../seeds/seeder.js';
import { auditWallet } from '../src/modules/economy/ledger.js';
import {
  AccommodationAssignment,
  Bill,
  Discovery,
  Friendship,
  Hostel,
  InventoryItem,
  Job,
  LedgerEntry,
  Player,
  StudentRecord,
  University,
  User,
  Wallet,
} from '../src/modules/models.js';

const ECONOMY = JSON.parse(
  readFileSync(new URL('../data/economy/global.json', import.meta.url), 'utf8'),
);
const ADMIN_KEY = 'test-only-admin-key-0123456789abcdef0123';
const { app, env } = buildTestApp({ ADMIN_API_KEY: ADMIN_KEY });

beforeAll(async () => {
  await connectTestDb();
  await importSeeds();
});
afterAll(closeTestDb);
beforeEach(async () => {
  // (ledger entries are append-only through the model; tests clear the raw collection)
  await Promise.all(
    [
      User,
      Player,
      StudentRecord,
      Wallet,
      LedgerEntry,
      Bill,
      InventoryItem,
      Job,
      Discovery,
      Friendship,
      AccommodationAssignment,
    ].map((M) => M.collection.deleteMany({})),
  );
});

const eco = (who) => ({
  get: (url) => request(app).get(`/api/v1/economy${url}`).set(who.auth),
  post: (url, body) => request(app).post(`/api/v1/economy${url}`).set(who.auth).send(body),
  patch: (url, body) => request(app).patch(`/api/v1/economy${url}`).set(who.auth).send(body),
  del: (url) => request(app).delete(`/api/v1/economy${url}`).set(who.auth),
});
const rk = () => randomUUID().replaceAll('-', '');
const student = (opts) => makePlayer(env, { universitySlug: 'unilag', ...opts });
const buy = (who, itemKey, quantity = 1, requestKey = rk()) =>
  eco(who).post('/purchases', { itemKey, quantity, requestKey });
const grant = (who, amount) =>
  request(app)
    .post(`/api/v1/admin/economy/players/${who.player._id}/adjustments`)
    .set('X-Admin-Key', ADMIN_KEY)
    .send({ amount, reason: 'Test top-up for purchases', requestKey: rk() });

async function befriend(a, b) {
  const sent = await request(app)
    .post('/api/v1/social/friend-requests')
    .set(a.auth)
    .send({ username: b.username });
  await request(app)
    .post(`/api/v1/social/friend-requests/${sent.body.data.request._id}/accept`)
    .set(b.auth);
}

describe('wallet', () => {
  it('starts with a one-time welcome grant and a weekly allowance that can be claimed once', async () => {
    const me = await student();
    const first = await eco(me).get('/wallet');
    expect(first.body.data.wallet).toMatchObject({
      balance: 500,
      currency: { symbol: 'CC' },
      isSimulated: true,
      energy: 100,
    });
    expect((await eco(me).get('/wallet')).body.data.wallet.balance).toBe(500); // not granted twice

    const claim = await eco(me).post('/wallet/allowance');
    expect(claim.body.data.wallet.balance).toBe(700);
    expect((await eco(me).post('/wallet/allowance')).body.error.code).toBe('ALREADY_CLAIMED');
    const history = await eco(me).get('/wallet/transactions');
    expect(history.body.data.entries.map((e) => e.kind)).toEqual(['allowance', 'grant']);
    expect(history.body.data.entries[0].balanceAfter).toBe(700);
  });

  it('the ledger is append-only and always matches the balance', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    await expect(LedgerEntry.updateOne({}, { $set: { amount: 1_000_000 } })).rejects.toThrow(
      /append-only/,
    );
    expect(await auditWallet(me.player._id)).toMatchObject({ consistent: true, balance: 500 });
  });
});

describe('shop and inventory', () => {
  it('charges the server price; the client cannot send a price', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    expect(
      (
        await eco(me).post('/purchases', {
          itemKey: 'meat-pie',
          quantity: 1,
          requestKey: rk(),
          price: 1,
        })
      ).status,
    ).toBe(400);
    const res = await buy(me, 'meat-pie', 2);
    expect(res.status).toBe(201);
    expect(res.body.data.wallet.balance).toBe(500 - 80);
    const inv = await eco(me).get('/inventory');
    expect(inv.body.data.items.find((i) => i.itemKey === 'meat-pie')).toMatchObject({
      quantity: 2,
      usable: true,
    });
  });

  it('refuses purchases it cannot afford and never goes negative, even under parallel requests', async () => {
    const me = await student();
    await eco(me).get('/wallet'); // 500
    expect((await buy(me, 'laptop')).body.error.code).toBe('INSUFFICIENT_FUNDS');
    // ten parallel 120-coin purchases from a 500 balance: at most four can succeed
    const results = await Promise.all(Array.from({ length: 10 }, () => buy(me, 'jollof-pack')));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBeLessThanOrEqual(4);
    const wallet = await Wallet.findOne({ player: me.player._id });
    expect(wallet.balance).toBe(500 - ok * 120);
    expect(wallet.balance).toBeGreaterThanOrEqual(0);
    expect(
      (await InventoryItem.findOne({ player: me.player._id, itemKey: 'jollof-pack' })).quantity,
    ).toBe(ok);
    expect((await auditWallet(me.player._id)).consistent).toBe(true);
  });

  it('a retried purchase (same request key) is charged once', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    const key = rk();
    const [a, b] = await Promise.all([buy(me, 'suya-wrap', 1, key), buy(me, 'suya-wrap', 1, key)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect((await Wallet.findOne({ player: me.player._id })).balance).toBe(420);
    expect(await LedgerEntry.countDocuments({ player: me.player._id, kind: 'purchase' })).toBe(1);
  });

  it('clothes join the wardrobe once and can then be worn', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    await grant(me, 1000);
    expect((await buy(me, 'agbada')).status).toBe(201);
    expect((await buy(me, 'agbada')).body.error.code).toBe('ALREADY_OWNED');
    const wardrobe = await request(app).get('/api/v1/wardrobe').set(me.auth);
    expect(wardrobe.body.data.owned.map((o) => o.itemKey)).toContain('agbada');
  });

  it('eating restores energy; only friends can receive gifts, and only giftable items', async () => {
    const me = await student();
    const friend = await student();
    const stranger = await student();
    await eco(me).get('/wallet');
    await buy(me, 'puff-puff', 3);
    await Wallet.updateOne(
      { player: me.player._id },
      { $set: { energy: 50, energyUpdatedAt: new Date() } },
    );
    const used = await eco(me).post('/inventory/puff-puff/use');
    expect(used.body.data.energy).toBe(60);

    expect(
      (
        await eco(me).post('/gifts', {
          itemKey: 'puff-puff',
          toPlayerId: String(stranger.player._id),
        })
      ).body.error.code,
    ).toBe('GIFT_NOT_ALLOWED');
    await befriend(me, friend);
    const gift = await eco(me).post('/gifts', {
      itemKey: 'puff-puff',
      quantity: 2,
      toPlayerId: String(friend.player._id),
    });
    expect(gift.status).toBe(201);
    expect(
      (await InventoryItem.findOne({ player: friend.player._id, itemKey: 'puff-puff' })).quantity,
    ).toBe(2);
    expect(
      (await InventoryItem.findOne({ player: me.player._id, itemKey: 'puff-puff' })).quantity,
    ).toBe(0);
    expect(
      (
        await eco(me).post('/gifts', {
          itemKey: 'puff-puff',
          toPlayerId: String(friend.player._id),
        })
      ).body.error.code,
    ).toBe('NOT_OWNED');

    await grant(me, 1000);
    await buy(me, 'camera');
    expect(
      (await eco(me).post('/gifts', { itemKey: 'camera', toPlayerId: String(friend.player._id) }))
        .body.error.code,
    ).toBe('NOT_TRANSFERABLE');
  });
});

describe('bills, savings and budget', () => {
  it('a housed student gets a weekly hostel fee bill and pays it once', async () => {
    const me = await student({ gender: 'female' });
    const unilag = await University.findOne({ slug: 'unilag' });
    const hostel = await Hostel.findOne({ university: unilag._id, slug: 'ulws-hostel' });
    await AccommodationAssignment.create({
      player: me.player._id,
      university: unilag._id,
      hostel: hostel._id,
      status: 'active',
      holding: true,
      room: 1,
      bed: 1,
      via: 'direct',
    });
    const bills = await eco(me).get('/bills');
    expect(bills.body.data.bills).toHaveLength(1);
    const bill = bills.body.data.bills[0];
    expect(bill).toMatchObject({
      kind: 'hostel-fee',
      amount: ECONOMY.rules.hostelWeeklyFee,
      status: 'due',
    });
    const paid = await eco(me).post(`/bills/${bill._id}/pay`);
    expect(paid.body.data.wallet.balance).toBe(500 - ECONOMY.rules.hostelWeeklyFee);
    expect((await eco(me).post(`/bills/${bill._id}/pay`)).status).toBe(404);
    expect((await eco(me).get('/bills')).body.data.bills).toHaveLength(1); // still one bill this week
  });

  it('moves money to savings and back, never more than is there', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    const dep = await eco(me).post('/wallet/savings', {
      direction: 'deposit',
      amount: 200,
      requestKey: rk(),
    });
    expect(dep.body.data.wallet).toMatchObject({ balance: 300, savings: 200 });
    const tooMuch = await eco(me).post('/wallet/savings', {
      direction: 'withdraw',
      amount: 500,
      requestKey: rk(),
    });
    expect(tooMuch.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await Wallet.findOne({ player: me.player._id })).toMatchObject({
      balance: 300,
      savings: 200,
    });
    await eco(me).post('/wallet/savings', { direction: 'withdraw', amount: 50, requestKey: rk() });
    expect((await auditWallet(me.player._id)).consistent).toBe(true);
  });

  it('summarises spending against a weekly budget and a savings goal', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    await eco(me).patch('/wallet/plan', {
      weeklyBudget: 200,
      savingsGoal: { label: 'New laptop', target: 1000 },
    });
    await buy(me, 'jollof-pack');
    await buy(me, 'notebook', 2);
    await eco(me).post('/wallet/savings', { direction: 'deposit', amount: 100, requestKey: rk() });
    const { budget } = (await eco(me).get('/wallet/budget')).body.data;
    expect(budget).toMatchObject({
      spentThisWeek: 180,
      weeklyBudget: 200,
      budgetLeft: 20,
      savings: 100,
      goalPercent: 10,
    });
    expect(budget.spendingByCategory30d).toMatchObject({ food: 120, stationery: 60 });
  });
});

describe('hustles', () => {
  const ERRANDS = ECONOMY.hustles.find((h) => h.key === 'campus-errands');
  const answerFor = (task) => {
    const template = ERRANDS.jobs.find((j) =>
      j.task.engine === 'ordering' ? task.engine === 'ordering' : task.engine === 'scenario',
    );
    if (task.engine === 'ordering') return { order: template.task.content.items.map((i) => i.id) };
    return {
      choices: Object.fromEntries(
        template.task.content.steps.map((s) => [
          s.id,
          [...s.choices].sort((a, b) => b.points - a.points)[0].id,
        ]),
      ),
    };
  };

  it('errands need no tools: accept → do the task → get paid once → rest (cooldown)', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    const list = (await eco(me).get('/hustles')).body.data.hustles;
    expect(list.find((h) => h.key === 'campus-errands').canAccept).toBe(true);
    expect(list.find((h) => h.key === 'graphic-design').blockers[0]).toMatch(/laptop/);

    const accepted = await eco(me).post('/hustles/campus-errands/jobs');
    expect(accepted.status).toBe(201);
    expect(JSON.stringify(accepted.body.data.task)).not.toMatch(/"points"|"feedback"/);
    const jobId = accepted.body.data.job.id;
    const [done, again] = await Promise.all([
      eco(me).post(`/jobs/${jobId}/complete`, { answer: answerFor(accepted.body.data.task) }),
      eco(me).post(`/jobs/${jobId}/complete`, { answer: answerFor(accepted.body.data.task) }),
    ]);
    const okOnes = [done, again].filter((r) => r.status === 200);
    expect(okOnes).toHaveLength(1);
    expect(okOnes[0].body.data).toMatchObject({ done: true, pay: ERRANDS.basePay });
    expect((await Wallet.findOne({ player: me.player._id })).balance).toBe(500 + ERRANDS.basePay);
    expect(await LedgerEntry.countDocuments({ player: me.player._id, kind: 'hustle' })).toBe(1);

    const wallet = (await eco(me).get('/wallet')).body.data.wallet;
    expect(wallet.energy).toBe(100 - ERRANDS.energyCost);
    const rest = await eco(me).post('/hustles/campus-errands/jobs');
    expect(rest.body.error.code).toBe('CANNOT_ACCEPT');
    expect(rest.body.error.details.join(' ')).toMatch(/Resting/);
  });

  it('poor work earns nothing; tools and stock are required; stock is used up', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    expect((await eco(me).post('/hustles/tutoring/jobs')).body.error.code).toBe('CANNOT_ACCEPT');
    await grant(me, 1000);
    await buy(me, 'cooler-box');
    expect((await eco(me).post('/hustles/food-sales/jobs')).body.error.details.join(' ')).toMatch(
      /snack-stock/,
    );
    await buy(me, 'snack-stock', 1);
    const job = await eco(me).post('/hustles/food-sales/jobs');
    expect(job.status).toBe(201);
    expect(
      (await InventoryItem.findOne({ player: me.player._id, itemKey: 'snack-stock' })).quantity,
    ).toBe(0);
    const bad = await eco(me).post(`/jobs/${job.body.data.job.id}/complete`, {
      answer: { choices: { s1: 'b', s2: 'b', s3: 'b' } },
    });
    expect(bad.body.data).toMatchObject({ done: true, pay: 0 });
  });

  it('a delivery is paid only after walking pickup → drop-off in the world', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    await buy(me, 'power-bank');
    const job = (await eco(me).post('/hustles/delivery/jobs')).body.data;
    expect(job.task.type).toBe('route');
    const id = job.job.id;
    const early = await eco(me).post(`/jobs/${id}/complete`, {});
    expect(early.body.data).toMatchObject({ done: false, pay: 0 });

    const visit = (slug) =>
      request(app).post('/api/v1/campus/discoveries').set(me.auth).send({ locationSlug: slug });
    await visit(job.task.pickup.slug);
    await new Promise((r) => setTimeout(r, 5));
    await visit(job.task.dropoff.slug);
    const done = await eco(me).post(`/jobs/${id}/complete`, {});
    expect(done.body.data).toMatchObject({ done: true, pay: 70 });
  });

  it('one job at a time, and expired jobs pay nothing', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    const job = await eco(me).post('/hustles/campus-errands/jobs');
    await buy(me, 'power-bank');
    expect((await eco(me).post('/hustles/delivery/jobs')).body.error.code).toBe('JOB_IN_PROGRESS');
    await Job.updateOne(
      { _id: job.body.data.job.id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect(
      (await eco(me).post(`/jobs/${job.body.data.job.id}/complete`, { answer: { order: [] } })).body
        .error.code,
    ).toBe('JOB_EXPIRED');
  });
});

describe('admin audit', () => {
  it('shows a consistent ledger, and adjustments need a reason and an admin', async () => {
    const me = await student();
    await eco(me).get('/wallet');
    expect(
      (
        await request(app)
          .post(`/api/v1/admin/economy/players/${me.player._id}/adjustments`)
          .set(me.auth)
          .send({ amount: 1000, reason: 'please', requestKey: rk() })
      ).status,
    ).toBe(403);
    await grant(me, 250);
    const audit = await request(app)
      .get(`/api/v1/admin/economy/players/${me.player._id}/audit`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(audit.body.data.audit).toMatchObject({ consistent: true, balance: 750 });
    expect(audit.body.data.entries[0]).toMatchObject({ kind: 'admin-adjust', amount: 250 });
  });
});
