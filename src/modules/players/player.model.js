import mongoose from '../../core/db/mongoose.js';

// the game character's gender (used later for hostels and eligibility rules) — fictional
export const PLAYER_GENDERS = ['male', 'female'];
export const PRIVACY_AUDIENCES = ['everyone', 'friends', 'nobody'];

// the in-game identity of a user. Public to other players: displayName only.
const playerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      immutable: true,
    },
    displayName: {
      type: String,
      required: [true, 'Please choose a display name'],
      trim: true,
      minlength: [2, 'A display name must have at least 2 characters'],
      maxlength: [40, 'A display name must have at most 40 characters'],
    },
    gender: {
      type: String,
      enum: { values: PLAYER_GENDERS, message: 'Gender is either: male or female' },
    },
    bio: { type: String, trim: true, maxlength: [280, 'A bio must have at most 280 characters'] },
    // what other players may see and do (the player controls this)
    privacy: {
      profileVisibility: { type: String, enum: PRIVACY_AUDIENCES, default: 'everyone' },
      messagesFrom: { type: String, enum: PRIVACY_AUDIENCES, default: 'friends' },
      allowFriendRequests: { type: Boolean, default: true },
      showOnline: { type: Boolean, default: true },
      shareActivity: { type: Boolean, default: true }, // "Ada is eating at 2001 Cafeteria" to friends
    },
    // set by moderators: no zone chat / messages until then
    chatMutedUntil: { type: Date, select: false },
    // account deleted: the identity is anonymised ("Deleted player"), see account.service.js
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

const Player = mongoose.model('Player', playerSchema);

export default Player;
