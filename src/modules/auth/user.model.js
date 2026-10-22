import bcrypt from 'bcryptjs';
import { z } from 'zod';
import mongoose from '../../core/db/mongoose.js';

const isEmail = (val) => z.email().safeParse(val).success;

export const USER_ROLES = ['player', 'admin'];
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,24}$/;
const BCRYPT_COST = 12;

// a login account. Game identity lives in Player; simulated studies in StudentRecord.
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Please provide your email'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: [isEmail, 'Please provide a valid email'],
    },
    username: {
      type: String,
      required: [true, 'Please choose a username'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [USERNAME_PATTERN, 'A username is 3–24 characters: a-z, 0-9, _ and .'],
    },
    // only the bcrypt hash is ever stored; never returned by queries
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: { values: USER_ROLES, message: 'This role does not exist' },
      default: 'player',
    },
    passwordChangedAt: { type: Date, select: false },
    // bumped to invalidate every access token at once (password change, "log out everywhere")
    tokenVersion: { type: Number, default: 0, select: false },
    // brute-force protection
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    // set by moderators: the account cannot sign in or use the API until then
    suspendedUntil: { type: Date, select: false },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    delete ret.failedLoginCount;
    delete ret.lockedUntil;
    delete ret.suspendedUntil;
    delete ret.passwordChangedAt;
    return ret;
  },
});

userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_COST);

// instance method to check a password (bcrypt compare runs in constant time)
userSchema.methods.correctPassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.isLocked = function (now = Date.now()) {
  return Boolean(this.lockedUntil && this.lockedUntil.getTime() > now);
};

const User = mongoose.model('User', userSchema);

export default User;
