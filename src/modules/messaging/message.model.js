import mongoose from '../../core/db/mongoose.js';
import { MAX_MESSAGE_LENGTH } from '../moderation/textFilter.js';

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.ObjectId,
      ref: 'Conversation',
      required: true,
      immutable: true,
    },
    sender: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    text: { type: String, required: true, trim: true, maxlength: MAX_MESSAGE_LENGTH },
    // the filter changed something (kept so moderators know the original was cleaned)
    masked: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversation: 1, _id: -1 });

const Message = mongoose.model('Message', messageSchema);

export default Message;
