import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { LedgerEntry, Wallet } from './economy.models.js';

/*
 * LEDGER — the only code that changes coin balances.
 *
 *   post({ player, amount, kind, category, description, idempotencyKey, ref, actor, account }, session)
 *
 * 1) the idempotency key is claimed by inserting the ledger entry (unique index):
 *    the same operation can never be applied twice, even under concurrent requests
 * 2) the balance moves with ONE guarded atomic update — a debit only matches when the
 *    balance covers it, so balances never go negative and two parallel spends can't
 *    both use the same coins
 * 3) if the balance update fails, the claimed entry is removed again (and inside a
 *    transaction, everything rolls back anyway)
 * Amounts are whole coins; the server decides every amount — clients never send prices.
 */
const trusted = (q) => mongoose.trusted(q);

export class DuplicateOperation extends Error {
  constructor(entry) {
    super('This operation was already applied.');
    this.entry = entry;
  }
}

export async function ensureWallet(playerId, session = null) {
  await Wallet.updateOne(
    { player: playerId },
    { $setOnInsert: { player: playerId } },
    { upsert: true, session },
  ).catch((err) => {
    if (err.code !== 11000) throw err;
  });
  return Wallet.findOne({ player: playerId }).session(session);
}

/** Apply one ledger entry. Throws INSUFFICIENT_FUNDS, or DuplicateOperation when the key was used. */
export async function post(
  {
    player,
    amount,
    kind,
    category = 'other',
    description,
    idempotencyKey,
    ref,
    actor = 'system',
    account = 'wallet',
  },
  session = null,
) {
  if (!Number.isInteger(amount) || amount === 0)
    throw new Error(`Ledger amounts must be non-zero whole coins (${amount})`);
  // inside a transaction the caller creates the wallet first (an upsert race would abort it)
  if (!session) await ensureWallet(player);

  // (checked first: inside a transaction a duplicate-key error would abort everything)
  const existing = await LedgerEntry.findOne({ idempotencyKey }).session(session);
  if (existing) throw new DuplicateOperation(existing);

  let entry;
  try {
    [entry] = await LedgerEntry.create(
      [{ player, amount, kind, category, description, idempotencyKey, ref, actor, account }],
      { session },
    );
  } catch (err) {
    if (err.code === 11000) {
      throw new DuplicateOperation(await LedgerEntry.findOne({ idempotencyKey }).session(session));
    }
    throw err;
  }

  const field = account === 'savings' ? 'savings' : 'balance';
  const filter = { player, ...(amount < 0 && { [field]: trusted({ $gte: -amount }) }) };
  const wallet = await Wallet.findOneAndUpdate(
    filter,
    { $inc: { [field]: amount } },
    { returnDocument: 'after', session },
  );
  if (!wallet) {
    // not enough coins: release the claimed key (the transaction, if any, is rolled back by the caller)
    if (!session) await LedgerEntry.deleteOne({ _id: entry._id }, { ledgerMaintenance: true });
    throw new AppError(
      account === 'savings'
        ? 'Not enough coins in your savings.'
        : 'Not enough Campus Coins for that.',
      409,
      'INSUFFICIENT_FUNDS',
    );
  }
  // record the running balance on the entry (the only write a ledger entry ever gets)
  await LedgerEntry.updateOne(
    { _id: entry._id },
    { $set: { balanceAfter: wallet[field] } },
    { session, ledgerMaintenance: true },
  );
  entry.balanceAfter = wallet[field];
  return { entry, wallet };
}

/** Like post(), but returns the earlier result instead of throwing when it was already applied. */
export async function postOnce(fields, session = null) {
  try {
    return { ...(await post(fields, session)), duplicate: false };
  } catch (err) {
    if (err instanceof DuplicateOperation)
      return {
        entry: err.entry,
        wallet: await ensureWallet(fields.player, session),
        duplicate: true,
      };
    throw err;
  }
}

/** Audit: does the wallet match the sum of its ledger? */
export async function auditWallet(playerId) {
  const wallet = await ensureWallet(playerId);
  const sums = await LedgerEntry.aggregate([
    { $match: { player: wallet.player } },
    { $group: { _id: '$account', total: { $sum: '$amount' }, entries: { $sum: 1 } } },
  ]);
  const totals = Object.fromEntries(sums.map((s) => [s._id, s.total]));
  const entries = sums.reduce((n, s) => n + s.entries, 0);
  return {
    balance: wallet.balance,
    savings: wallet.savings,
    ledgerWallet: totals.wallet ?? 0,
    ledgerSavings: totals.savings ?? 0,
    entries,
    consistent: (totals.wallet ?? 0) === wallet.balance && (totals.savings ?? 0) === wallet.savings,
  };
}
