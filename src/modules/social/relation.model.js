import mongoose from '../../core/db/mongoose.js';

/*
 * One player's personal safety choice about another:
 *   block — they can't message me, friend me, invite me, or see me in chat/presence
 *   mute  — I just stop seeing their zone chat
 */
export const RELATION_TYPES = ['block', 'mute'];

const relationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    target: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    type: { type: String, required: true, enum: RELATION_TYPES, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

relationSchema.index({ owner: 1, target: 1, type: 1 }, { unique: true });
relationSchema.index({ target: 1, type: 1 });

const PlayerRelation = mongoose.model('PlayerRelation', relationSchema);

export default PlayerRelation;
