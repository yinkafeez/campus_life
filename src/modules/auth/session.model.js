import mongoose from '../../core/db/mongoose.js';

/*
 * A login session = one refresh token "family" on one device.
 * The refresh token itself is random; only its SHA-256 hash is stored.
 * Each refresh ROTATES the token (new document, old one revoked with replacedBy);
 * presenting an already-rotated token means it was stolen → the whole family is revoked.
 */
const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    // every rotation of one login shares a family id
    family: { type: String, required: true, immutable: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: {
      type: String,
      enum: ['logout', 'rotated', 'reuse-detected', 'password-change'],
    },
    replacedBy: { type: mongoose.Schema.ObjectId, ref: 'Session' },
    userAgent: { type: String, maxlength: 300 },
    lastUsedAt: Date,
  },
  { timestamps: true },
);

sessionSchema.index({ user: 1, revokedAt: 1 });
sessionSchema.index({ family: 1 });
// MongoDB deletes sessions automatically once they expire
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model('Session', sessionSchema);

export default Session;
