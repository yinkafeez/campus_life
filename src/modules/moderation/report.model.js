import mongoose from '../../core/db/mongoose.js';

export const REPORT_CONTEXTS = ['profile', 'chat', 'message', 'group', 'event'];
export const REPORT_REASONS = [
  'harassment',
  'hate',
  'sexual',
  'spam',
  'scam',
  'personal-info',
  'impersonation',
  'other',
];
export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'];
export const MODERATION_ACTIONS = ['none', 'warn', 'mute-chat', 'suspend'];

// a player reporting another player's behaviour, reviewed by moderators (admins)
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    target: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    context: { type: String, enum: REPORT_CONTEXTS, required: true, immutable: true },
    reason: { type: String, enum: REPORT_REASONS, required: true, immutable: true },
    details: { type: String, trim: true, maxlength: 1000 },
    // what was said, captured by the SERVER (never typed by the reporter)
    evidence: {
      messageId: { type: mongoose.Schema.ObjectId, ref: 'Message' },
      text: { type: String, maxlength: 600 },
      saidAt: Date,
    },
    status: { type: String, enum: REPORT_STATUSES, default: 'open' },
    resolution: {
      action: { type: String, enum: MODERATION_ACTIONS },
      durationHours: Number,
      note: { type: String, trim: true, maxlength: 1000 },
      by: String,
      at: Date,
    },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ target: 1, createdAt: -1 });
// RETENTION: a resolved report (and its quoted evidence) is kept for one year, then deleted
// automatically; open reports never expire (docs/SECURITY.md → retention)
export const RESOLVED_REPORT_RETENTION_DAYS = 365;
reportSchema.index(
  { 'resolution.at': 1 },
  { expireAfterSeconds: RESOLVED_REPORT_RETENTION_DAYS * 86_400 },
);

const Report = mongoose.model('Report', reportSchema);

export default Report;
