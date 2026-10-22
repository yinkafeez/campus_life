import mongoose from '../../core/db/mongoose.js';

/*
 * VIRTUAL ECONOMY — a fictional currency ("Campus Coins") with no real-money value:
 * it can't be bought or cashed out, and nothing in the game is a wager.
 *
 * The LEDGER is the source of truth: every coin that moves is one immutable entry with a
 * unique idempotency key. The wallet balance is a running total kept in step with it by
 * guarded atomic updates (balance can never go below zero).
 */

export const LEDGER_KINDS = [
  'grant', // welcome money
  'allowance', // weekly allowance
  'purchase',
  'refund',
  'hustle', // pay for a completed job
  'bill', // hostel fee and other expenses
  'savings-in', // wallet → savings
  'savings-out', // savings → wallet
  'prize', // games and competitions
  'welfare', // grants from elected leaders' game-funded welfare budgets
  'admin-adjust', // moderator correction (always with a reason)
];

export const SPEND_CATEGORIES = [
  'food',
  'clothing',
  'accessories',
  'stationery',
  'tools',
  'stock',
  'housing',
  'savings',
  'income',
  'other',
];

const walletSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.ObjectId,
      ref: 'Player',
      required: true,
      unique: true,
      immutable: true,
    },
    balance: { type: Number, default: 0, min: [0, 'A balance can never be negative'] },
    savings: { type: Number, default: 0, min: 0 },
    savingsGoal: {
      label: { type: String, trim: true, maxlength: 60 },
      target: { type: Number, min: 1, max: 1_000_000 },
    },
    // optional self-imposed weekly spending limit (a budgeting aid, never enforced as a block)
    weeklyBudget: { type: Number, min: 0, max: 1_000_000 },
    // energy for hustles: 0..max, regenerates over time (computed lazily)
    energy: { type: Number, default: 100, min: 0 },
    energyUpdatedAt: { type: Date, default: () => new Date() },
    isSimulated: { type: Boolean, default: true, immutable: true },
  },
  { timestamps: true },
);

const ledgerSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true }, // + credit / − debit, whole coins
    balanceAfter: Number, // set once, right after the entry is posted
    account: { type: String, enum: ['wallet', 'savings'], default: 'wallet', immutable: true },
    kind: { type: String, enum: LEDGER_KINDS, required: true, immutable: true },
    category: { type: String, enum: SPEND_CATEGORIES, default: 'other', immutable: true },
    description: { type: String, required: true, maxlength: 200, immutable: true },
    ref: {
      type: { type: String, maxlength: 40 },
      id: { type: String, maxlength: 80 },
    },
    // the same operation can never be applied twice
    idempotencyKey: { type: String, required: true, unique: true, immutable: true, maxlength: 200 },
    actor: { type: String, maxlength: 80 }, // who caused it (player / system / admin-key / user:<id>)
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ledgerSchema.index({ player: 1, createdAt: -1 });
// entries are append-only
ledgerSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'],
  function () {
    if (!this.getOptions().ledgerMaintenance) throw new Error('Ledger entries are append-only');
  },
);

// a weekly expense (hostel fee…) that the player pays from their wallet
const billSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    kind: { type: String, required: true, maxlength: 40, immutable: true },
    period: { type: String, required: true, maxlength: 20, immutable: true }, // e.g. "2026-W43"
    label: { type: String, required: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 1 },
    dueAt: { type: Date, required: true },
    status: { type: String, enum: ['due', 'paid', 'waived'], default: 'due' },
    paidAt: Date,
  },
  { timestamps: true },
);
billSchema.index({ player: 1, kind: 1, period: 1 }, { unique: true });
billSchema.index({ player: 1, status: 1 });

// ─── Catalogue (imported from data/economy/*.json) ───────────────────────
export const SHOP_KINDS = ['food', 'clothing', 'accessories', 'stationery', 'tools', 'stock'];

const shopItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, maxlength: 80 },
    kind: { type: String, enum: SHOP_KINDS, required: true },
    description: { type: String, maxlength: 300 },
    price: { type: Number, required: true, min: 1, max: 100_000 },
    // wardrobe items are owned once and worn; others stack
    wardrobe: { type: Boolean, default: false },
    effects: { energy: { type: Number, min: 0, max: 100 } }, // food restores energy when used
    transferable: { type: Boolean, default: false },
    maxPerPurchase: { type: Number, min: 1, max: 50, default: 10 },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
  },
  { timestamps: true, minimize: false },
);

const hustleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, maxlength: 80 },
    category: { type: String, maxlength: 40 },
    description: { type: String, maxlength: 400 },
    requires: { type: [String], default: [] }, // item keys the player must own (tools)
    consumes: { type: [{ itemKey: String, quantity: Number, _id: false }], default: [] }, // stock used per job
    energyCost: { type: Number, min: 0, max: 100, default: 20 },
    cooldownMinutes: { type: Number, min: 0, max: 1440, default: 30 },
    maxJobsPerDay: { type: Number, min: 1, max: 50, default: 5 },
    // pay = basePay × score%, only when the work passes
    basePay: { type: Number, min: 1, max: 10_000, required: true },
    passPercent: { type: Number, min: 1, max: 100, default: 60 },
    // job templates: { key, client, brief, task: { engine, content } | { type: 'route', pickup, dropoff } }
    jobs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    status: { type: String, enum: ['active', 'retired'], default: 'active' },
  },
  { timestamps: true, minimize: false },
);

export const JOB_STATUSES = ['active', 'completed', 'failed', 'expired', 'abandoned'];

const jobSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    hustle: { type: String, required: true, immutable: true },
    template: { type: String, required: true, immutable: true },
    status: { type: String, enum: JOB_STATUSES, default: 'active' },
    open: { type: Boolean }, // true while active — one active job per player
    seed: { type: Number, required: true, immutable: true },
    secret: { type: mongoose.Schema.Types.Mixed, select: false },
    acceptedAt: { type: Date, default: () => new Date(), immutable: true },
    expiresAt: { type: Date, required: true },
    completedAt: Date,
    percent: Number,
    pay: { type: Number, default: 0 },
    result: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);
jobSchema.index(
  { player: 1 },
  { unique: true, partialFilterExpression: { open: true }, name: 'one_active_job' },
);
jobSchema.index({ player: 1, hustle: 1, completedAt: -1 });

// currency + rules (one document, key "global"), imported with the catalogue
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    currency: { name: String, symbol: String },
    rules: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

export const EconomySettings = mongoose.model('EconomySettings', settingsSchema);
export const Wallet = mongoose.model('Wallet', walletSchema);
export const LedgerEntry = mongoose.model('LedgerEntry', ledgerSchema);
export const Bill = mongoose.model('Bill', billSchema);
export const ShopItem = mongoose.model('ShopItem', shopItemSchema);
export const Hustle = mongoose.model('Hustle', hustleSchema);
export const Job = mongoose.model('Job', jobSchema);
