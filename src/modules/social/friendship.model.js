import mongoose from '../../core/db/mongoose.js';

export const FRIENDSHIP_STATUSES = ['pending', 'accepted'];

// "a:b" with ids sorted — one record per pair of players, whoever asked first
export const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');

const friendshipSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true, unique: true, immutable: true },
    requester: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    recipient: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    status: { type: String, enum: FRIENDSHIP_STATUSES, default: 'pending' },
    acceptedAt: Date,
  },
  { timestamps: true },
);

friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

const Friendship = mongoose.model('Friendship', friendshipSchema);

export default Friendship;
