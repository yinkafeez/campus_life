import { z } from 'zod';
import { USERNAME_PATTERN } from './user.model.js';

// bcrypt only uses the first 72 BYTES of a password — reject longer ones instead of truncating
export const passwordRule = z
  .string()
  .min(10, 'A password must have at least 10 characters')
  .refine((val) => Buffer.byteLength(val, 'utf8') <= 72, 'A password must be at most 72 bytes')
  .refine(
    (val) => /[A-Za-z]/.test(val) && /\d/.test(val),
    'Use at least one letter and one number',
  );

export const registerSchema = z
  .object({
    email: z.email('Please provide a valid email').trim().toLowerCase().max(254),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(USERNAME_PATTERN, 'A username is 3–24 characters: a-z, 0-9, _ and .'),
    password: passwordRule,
    displayName: z.string().trim().min(2).max(40),
    // the game is for players aged 16+ (see docs) — a checkbox, not identity verification
    confirmAge: z.literal(true, { error: 'You must confirm you are at least 16 years old' }),
  })
  .strict();

export const loginSchema = z
  .object({
    // email or username
    identifier: z.string().trim().toLowerCase().min(3).max(254),
    password: z.string().min(1).max(200),
  })
  .strict();
