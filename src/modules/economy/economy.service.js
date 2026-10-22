import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { runAtomic } from '../../core/db/atomic.js';
import InventoryItem from '../wardrobe/inventoryItem.model.js';
import AccommodationAssignment from '../accommodation/assignment.model.js';
import Player from '../players/player.model.js';
import { areFriends, blockedEitherWay } from '../social/social.service.js';
import { Bill, EconomySettings, LedgerEntry, ShopItem, Wallet } from './economy.models.js';
import { DuplicateOperation, ensureWallet, post, postOnce } from './ledger.js';

/*
 * ECONOMY SERVICE — wallet, allowance, bills, shop, inventory, gifts, savings, budget.
 * Every price, effect and amount is decided here from the catalogue; the client only
 * says WHAT it wants (item key + quantity), never how much it costs.
 */
const trusted = (q) => mongoose.trusted(q);
const DAY = 86_400_000;

export async function economySettings() {
  const settings = await EconomySettings.findOne({ key: 'global' });
  if (!settings)
    throw AppError.unavailable(
      'The shop is not open yet (economy data not imported).',
      'ECONOMY_NOT_READY',
    );
  return settings;
}

/** ISO week label ("2026-W43") and the week's start (Monday 00:00 UTC). */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  const monday = new Date(d.getTime() - (day - 1) * DAY);
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY + 1) / 7);
  return {
    label: `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    start: monday,
    end: new Date(monday.getTime() + 7 * DAY),
  };
}

// ─── Energy ───────────────────────────────────────────────────────────────
export function currentEnergy(wallet, rules, now = Date.now()) {
  const hours = Math.max(0, (now - new Date(wallet.energyUpdatedAt).getTime()) / 3_600_000);
  return Math.min(rules.energy.max, Math.floor(wallet.energy + hours * rules.energy.regenPerHour));
}

/** Spend energy atomically (settles regeneration first). Throws NOT_ENOUGH_ENERGY. */
export async function spendEnergy(playerId, amount, rules, session = null) {
  if (!amount) return;
  const wallet = await Wallet.findOne({ player: playerId }).session(session);
  const now = new Date();
  const energy = currentEnergy(wallet, rules, now.getTime());
  if (energy < amount)
    throw new AppError(
      `You're too tired (energy ${energy}/${amount}). Eat something or rest.`,
      409,
      'NOT_ENOUGH_ENERGY',
    );
  // guarded on the values we read, so two parallel jobs can't both spend the same energy
  const res = await Wallet.updateOne(
    { _id: wallet._id, energy: wallet.energy, energyUpdatedAt: wallet.energyUpdatedAt },
    { $set: { energy: energy - amount, energyUpdatedAt: now } },
    { session },
  );
  if (!res.modifiedCount) throw new AppError('Please try again.', 409, 'ENERGY_RACE');
}

async function addEnergy(playerId, amount, rules, session = null) {
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- optimistic retry
    const wallet = await Wallet.findOne({ player: playerId }).session(session);
    const now = new Date();
    const energy = Math.min(rules.energy.max, currentEnergy(wallet, rules, now.getTime()) + amount);
    // eslint-disable-next-line no-await-in-loop
    const res = await Wallet.updateOne(
      { _id: wallet._id, energy: wallet.energy, energyUpdatedAt: wallet.energyUpdatedAt },
      { $set: { energy, energyUpdatedAt: now } },
      { session },
    );
    if (res.modifiedCount) return energy;
  }
  throw new AppError('Please try again.', 409, 'ENERGY_RACE');
}

// ─── Wallet ───────────────────────────────────────────────────────────────
/** The wallet, after granting the one-time welcome money and raising this week's bills. */
export async function getWallet(player) {
  const settings = await economySettings();
  const { rules } = settings;
  await ensureWallet(player._id);
  if (rules.welcomeGrant) {
    await postOnce({
      player: player._id,
      amount: rules.welcomeGrant,
      kind: 'grant',
      category: 'income',
      description: 'Welcome money for your first days on campus',
      idempotencyKey: `grant:welcome:${player._id}`,
    });
  }
  await raiseWeeklyBills(player, rules);
  const wallet = await Wallet.findOne({ player: player._id });
  const week = isoWeek();
  const allowanceTaken = await LedgerEntry.exists({
    idempotencyKey: `allowance:${player._id}:${week.label}`,
  });
  return {
    currency: settings.currency,
    balance: wallet.balance,
    savings: wallet.savings,
    savingsGoal: wallet.savingsGoal?.target ? wallet.savingsGoal : null,
    weeklyBudget: wallet.weeklyBudget ?? null,
    energy: currentEnergy(wallet, rules),
    maxEnergy: rules.energy.max,
    allowance: {
      amount: rules.weeklyAllowance,
      available: Boolean(rules.weeklyAllowance) && !allowanceTaken,
      week: week.label,
    },
    isSimulated: true,
  };
}

export async function claimAllowance(player) {
  const { rules } = await economySettings();
  if (!rules.weeklyAllowance) throw AppError.badRequest('There is no allowance at the moment.');
  const week = isoWeek();
  const { duplicate } = await postOnce({
    player: player._id,
    amount: rules.weeklyAllowance,
    kind: 'allowance',
    category: 'income',
    description: `Weekly allowance (${week.label})`,
    idempotencyKey: `allowance:${player._id}:${week.label}`,
  });
  if (duplicate)
    throw new AppError('You already collected this week’s allowance.', 409, 'ALREADY_CLAIMED');
  return getWallet(player);
}

// ─── Bills (expenses) ─────────────────────────────────────────────────────
async function raiseWeeklyBills(player, rules) {
  if (!rules.hostelWeeklyFee) return;
  const housed = await AccommodationAssignment.exists({ player: player._id, status: 'active' });
  if (!housed) return;
  const week = isoWeek();
  await Bill.updateOne(
    { player: player._id, kind: 'hostel-fee', period: week.label },
    {
      $setOnInsert: {
        player: player._id,
        kind: 'hostel-fee',
        period: week.label,
        label: `Hostel fee (${week.label})`,
        amount: rules.hostelWeeklyFee,
        dueAt: week.end,
      },
    },
    { upsert: true },
  ).catch((err) => {
    if (err.code !== 11000) throw err;
  });
}

export async function listBills(player) {
  await getWallet(player); // raises this week's bills
  return Bill.find({ player: player._id }).sort({ dueAt: -1 }).limit(20);
}

export async function payBill(player, billId) {
  return runAtomic(async (session) => {
    const bill = await Bill.findOneAndUpdate(
      { _id: billId, player: player._id, status: 'due' },
      { $set: { status: 'paid', paidAt: new Date() } },
      { returnDocument: 'after', session },
    );
    if (!bill) throw AppError.notFound('No unpaid bill with that id.');
    try {
      await post(
        {
          player: player._id,
          amount: -bill.amount,
          kind: 'bill',
          category: 'housing',
          description: bill.label,
          idempotencyKey: `bill:${bill._id}`,
          ref: { type: 'bill', id: String(bill._id) },
          actor: `player:${player._id}`,
        },
        session,
      );
    } catch (err) {
      // standalone database: put the bill back to "due"
      if (!session)
        await Bill.updateOne({ _id: bill._id }, { $set: { status: 'due' }, $unset: { paidAt: 1 } });
      throw err;
    }
    return bill;
  });
}

// ─── Shop & inventory ─────────────────────────────────────────────────────
const presentItem = (item, owned = 0) => ({
  key: item.key,
  name: item.name,
  kind: item.kind,
  description: item.description ?? null,
  price: item.price,
  wardrobe: item.wardrobe,
  effects: item.effects ?? {},
  transferable: item.transferable,
  maxPerPurchase: item.maxPerPurchase,
  owned,
});

export async function listShop(player) {
  const [items, holdings] = await Promise.all([
    ShopItem.find({ status: 'active' }).sort({ kind: 1, price: 1 }),
    InventoryItem.find({ player: player._id }).select('itemKey quantity'),
  ]);
  const owned = new Map(holdings.map((h) => [h.itemKey, h.quantity ?? 1]));
  return items.map((item) => presentItem(item, owned.get(item.key) ?? 0));
}

/**
 * Buy an item. `requestKey` (client-generated) makes retries safe: the same purchase
 * request is charged at most once.
 */
export async function purchase(player, { itemKey, quantity, requestKey }) {
  const item = await ShopItem.findOne({ key: itemKey, status: 'active' });
  if (!item) throw AppError.notFound('That item is not sold here.');
  if (quantity > item.maxPerPurchase)
    throw AppError.badRequest(`You can buy at most ${item.maxPerPurchase} at a time.`);
  if (item.wardrobe && quantity !== 1)
    throw AppError.badRequest('Clothes are bought one at a time.');
  await ensureWallet(player._id);

  const idempotencyKey = `purchase:${player._id}:${requestKey}`;
  const earlier = await LedgerEntry.findOne({ idempotencyKey });
  if (earlier) return { duplicate: true, entry: earlier, item: presentItem(item) };

  if (item.wardrobe && (await InventoryItem.exists({ player: player._id, itemKey: item.key }))) {
    throw new AppError('You already own this.', 409, 'ALREADY_OWNED');
  }
  const total = item.price * quantity;

  let entry;
  try {
    entry = await runAtomic(async (session) => {
      const { entry: posted } = await post(
        {
          player: player._id,
          amount: -total,
          kind: 'purchase',
          category: item.kind,
          description: `${quantity} × ${item.name}`,
          idempotencyKey,
          ref: { type: 'item', id: item.key },
          actor: `player:${player._id}`,
        },
        session,
      );
      try {
        await InventoryItem.updateOne(
          { player: player._id, itemKey: item.key },
          {
            $inc: { quantity },
            $setOnInsert: {
              player: player._id,
              itemKey: item.key,
              source: 'purchase',
              acquiredAt: new Date(),
            },
          },
          { upsert: true, session },
        );
      } catch (err) {
        // standalone database: give the coins back (its own idempotent entry)
        if (!session) {
          await postOnce({
            player: player._id,
            amount: total,
            kind: 'refund',
            category: item.kind,
            description: `Refund: ${quantity} × ${item.name}`,
            idempotencyKey: `refund:${idempotencyKey}`,
          });
        }
        throw err;
      }
      return posted;
    });
  } catch (err) {
    // the same request arrived twice at the same moment: the other one was charged
    if (err instanceof DuplicateOperation)
      return { duplicate: true, entry: err.entry, item: presentItem(item) };
    throw err;
  }
  return { duplicate: false, entry, item: presentItem(item) };
}

/** My items (economy + wardrobe) with what each can do. */
export async function listInventory(player) {
  const holdings = await InventoryItem.find({
    player: player._id,
    quantity: trusted({ $gt: 0 }),
  }).sort({ updatedAt: -1 });
  const catalogue = new Map(
    (await ShopItem.find({ key: trusted({ $in: holdings.map((h) => h.itemKey) }) })).map((i) => [
      i.key,
      i,
    ]),
  );
  return holdings.map((h) => {
    const item = catalogue.get(h.itemKey);
    return {
      itemKey: h.itemKey,
      name: item?.name ?? h.itemKey,
      kind: item?.kind ?? 'clothing',
      quantity: h.quantity ?? 1,
      source: h.source,
      usable: Boolean(item?.effects?.energy),
      transferable: Boolean(item?.transferable),
      wardrobe: item ? item.wardrobe : true, // starter clothes come from the wardrobe catalogue
      effects: item?.effects ?? {},
    };
  });
}

/** Take `quantity` of an item from a player's inventory, only if they have that many. */
export async function takeItem(playerId, itemKey, quantity, session = null) {
  const res = await InventoryItem.updateOne(
    { player: playerId, itemKey, quantity: trusted({ $gte: quantity }) },
    { $inc: { quantity: -quantity } },
    { session },
  );
  return res.modifiedCount === 1;
}

export async function useItem(player, itemKey) {
  const item = await ShopItem.findOne({ key: itemKey });
  if (!item?.effects?.energy) throw AppError.badRequest('That item can’t be used.');
  const { rules } = await economySettings();
  await ensureWallet(player._id);
  return runAtomic(async (session) => {
    if (!(await takeItem(player._id, itemKey, 1, session)))
      throw new AppError("You don't have that item.", 409, 'NOT_OWNED');
    const energy = await addEnergy(player._id, item.effects.energy, rules, session);
    return { energy, used: item.name };
  });
}

/** Give items to a friend (only items marked transferable; blocks respected). */
export async function giftItem(player, { itemKey, quantity, toPlayerId }) {
  const item = await ShopItem.findOne({ key: itemKey });
  if (!item?.transferable)
    throw new AppError('That item can’t be given away.', 403, 'NOT_TRANSFERABLE');
  if (String(toPlayerId) === String(player._id))
    throw AppError.badRequest("You can't gift yourself.");
  const friend = await Player.findById(toPlayerId);
  if (
    !friend ||
    (await blockedEitherWay(player._id, friend._id)) ||
    !(await areFriends(player._id, friend._id))
  ) {
    throw new AppError('You can only give items to your friends.', 403, 'GIFT_NOT_ALLOWED');
  }
  return runAtomic(async (session) => {
    if (!(await takeItem(player._id, itemKey, quantity, session)))
      throw new AppError("You don't have enough of that.", 409, 'NOT_OWNED');
    try {
      await InventoryItem.updateOne(
        { player: friend._id, itemKey },
        {
          $inc: { quantity },
          $setOnInsert: { player: friend._id, itemKey, source: 'gift', acquiredAt: new Date() },
        },
        { upsert: true, session },
      );
    } catch (err) {
      if (!session)
        await InventoryItem.updateOne({ player: player._id, itemKey }, { $inc: { quantity } });
      throw err;
    }
    return { itemKey, quantity, to: { playerId: friend._id, displayName: friend.displayName } };
  });
}

// ─── Savings, budget, history ─────────────────────────────────────────────
export async function moveSavings(player, { direction, amount, requestKey }) {
  await ensureWallet(player._id);
  const toSavings = direction === 'deposit';
  const key = `savings:${player._id}:${requestKey}`;
  // the side that loses coins goes first: if it can't cover the amount, nothing moved
  const from = toSavings ? 'wallet' : 'savings';
  const to = toSavings ? 'savings' : 'wallet';
  const fields = {
    player: player._id,
    kind: toSavings ? 'savings-in' : 'savings-out',
    category: 'savings',
    description: toSavings ? 'Moved to savings' : 'Taken from savings',
    actor: `player:${player._id}`,
  };
  await runAtomic(async (session) => {
    await post(
      { ...fields, account: from, amount: -amount, idempotencyKey: `${key}:${from}` },
      session,
    );
    try {
      await post({ ...fields, account: to, amount, idempotencyKey: `${key}:${to}` }, session);
    } catch (err) {
      // standalone database: put the coins back where they came from
      if (!session) {
        await postOnce({
          ...fields,
          kind: 'refund',
          account: from,
          amount,
          description: 'Savings move reversed',
          idempotencyKey: `${key}:reverse`,
        });
      }
      throw err;
    }
  });
  return getWallet(player);
}

export async function setPlan(player, { weeklyBudget, savingsGoal }) {
  await ensureWallet(player._id);
  const set = {};
  const unset = {};
  if (weeklyBudget === null) unset.weeklyBudget = 1;
  else if (weeklyBudget !== undefined) set.weeklyBudget = weeklyBudget;
  if (savingsGoal === null) unset.savingsGoal = 1;
  else if (savingsGoal) set.savingsGoal = savingsGoal;
  await Wallet.updateOne(
    { player: player._id },
    {
      ...(Object.keys(set).length && { $set: set }),
      ...(Object.keys(unset).length && { $unset: unset }),
    },
  );
  return getWallet(player);
}

export async function history(player, { before, limit = 30, kind } = {}) {
  const filter = { player: player._id };
  if (kind) filter.kind = kind;
  if (before) filter._id = trusted({ $lt: new mongoose.Types.ObjectId(before) });
  const entries = await LedgerEntry.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1);
  return {
    entries: entries.slice(0, limit).map((e) => ({
      id: e._id,
      amount: e.amount,
      balanceAfter: e.balanceAfter,
      account: e.account,
      kind: e.kind,
      category: e.category,
      description: e.description,
      createdAt: e.createdAt,
    })),
    hasMore: entries.length > limit,
  };
}

/** Money in vs out by category, for this week and the last 30 days. */
export async function budgetSummary(player) {
  const wallet = await getWallet(player);
  const week = isoWeek();
  const since30 = new Date(Date.now() - 30 * DAY);
  const rows = await LedgerEntry.aggregate([
    {
      $match: {
        player: player._id,
        account: 'wallet',
        createdAt: { $gte: since30 },
        kind: { $nin: ['savings-in', 'savings-out'] },
      },
    },
    {
      $group: {
        _id: {
          category: '$category',
          inflow: { $gt: ['$amount', 0] },
          thisWeek: { $gte: ['$createdAt', week.start] },
        },
        total: { $sum: '$amount' },
      },
    },
  ]);
  const sum = (pred) => rows.filter(pred).reduce((n, r) => n + r.total, 0);
  const spending = {};
  rows
    .filter((r) => !r._id.inflow)
    .forEach((r) => {
      spending[r._id.category] = (spending[r._id.category] ?? 0) - r.total;
    });
  const spentThisWeek = -sum((r) => !r._id.inflow && r._id.thisWeek);
  return {
    week: week.label,
    incomeThisWeek: sum((r) => r._id.inflow && r._id.thisWeek),
    spentThisWeek,
    income30d: sum((r) => r._id.inflow),
    spent30d: -sum((r) => !r._id.inflow),
    spendingByCategory30d: spending,
    weeklyBudget: wallet.weeklyBudget,
    budgetLeft: wallet.weeklyBudget === null ? null : wallet.weeklyBudget - spentThisWeek,
    savings: wallet.savings,
    savingsGoal: wallet.savingsGoal,
    goalPercent: wallet.savingsGoal
      ? Math.min(100, Math.round((wallet.savings / wallet.savingsGoal.target) * 100))
      : null,
  };
}
