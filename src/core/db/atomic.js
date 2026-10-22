import mongoose from './mongoose.js';

/*
 * runAtomic(work) — run a multi-document change as a MongoDB TRANSACTION when the
 * deployment supports it (replica sets / Atlas — and the test database), otherwise run it
 * without one (a standalone local mongod). `work(session)` receives the session or null and
 * passes it to every operation ({ session }).
 *
 * Code written for this helper must stay safe WITHOUT a transaction too: use guarded
 * atomic updates (e.g. "balance >= price") and unique idempotency keys, and compensate if a
 * later step fails. Transactions then make it all-or-nothing on top of that.
 */
let supported = null;

export async function transactionsSupported() {
  if (supported !== null) return supported;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    supported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    supported = false;
  }
  return supported;
}

export function resetTransactionSupportCache() {
  supported = null;
}

export async function runAtomic(work) {
  if (!(await transactionsSupported())) return work(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
