import mongoose from '../../core/db/mongoose.js';

export const CONVERSATION_TYPES = ['direct', 'group'];

const memberSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true },
    lastReadAt: { type: Date, default: () => new Date(0) },
  },
  { _id: false },
);

// a chat thread: two players (direct) or a community group's members (group)
const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: CONVERSATION_TYPES, required: true, immutable: true },
    // direct only: "a:b" sorted ids, so a pair always shares one thread
    pairKey: { type: String, immutable: true },
    group: { type: mongoose.Schema.ObjectId, ref: 'CommunityGroup', immutable: true },
    members: { type: [memberSchema], default: [] },
    lastMessageAt: Date,
    lastMessage: {
      sender: { type: mongoose.Schema.ObjectId, ref: 'Player' },
      preview: { type: String, maxlength: 80 },
    },
  },
  { timestamps: true },
);

conversationSchema.index(
  { pairKey: 1 },
  { unique: true, partialFilterExpression: { pairKey: { $type: 'string' } } },
);
conversationSchema.index(
  { group: 1 },
  { unique: true, partialFilterExpression: { group: { $type: 'objectId' } } },
);
conversationSchema.index({ 'members.player': 1, lastMessageAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
