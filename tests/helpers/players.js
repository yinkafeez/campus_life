import mongoose from '../../src/core/db/mongoose.js';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import {
  Department,
  Faculty,
  Player,
  Programme,
  StudentRecord,
  University,
  User,
} from '../../src/modules/models.js';

/*
 * Fast fixtures for social/campus tests: a user + player (+ optionally a matriculated
 * simulated student record) and a Bearer header — no bcrypt round, no register flow.
 */
let n = 0;

export async function makePlayer(
  env,
  { gender, privacy, universitySlug, level = 100, status = 'active', ...rest } = {},
) {
  n += 1;
  const username = rest.username ?? `player_${n}`;
  const user = await User.create({
    email: `${username}@example.test`,
    username,
    passwordHash: 'not-a-real-hash',
  });
  const player = await Player.create({
    user: user._id,
    displayName: rest.displayName ?? `Player ${n}`,
    gender,
    privacy,
  });

  if (universitySlug) {
    const university = await University.findOne({ slug: universitySlug });
    const programme = await Programme.findOne({
      university: university._id,
      ...(rest.programmeCode && { code: rest.programmeCode }),
    });
    const department = await Department.findById(programme.department);
    const faculty = await Faculty.findById(department.faculty);
    await StudentRecord.create({
      player: player._id,
      university: university._id,
      faculty: faculty._id,
      department: department._id,
      programme: programme._id,
      entryLevel: rest.entryLevel ?? level,
      currentLevel: level,
      status,
      admission: { appliedAt: new Date(), reviewCompletesAt: new Date() },
      ...(rest.onboarded && { onboarding: { completedSteps: [], completedAt: new Date() } }),
    });
  }

  const token = signAccessToken(env, { user, session: { _id: new mongoose.Types.ObjectId() } });
  return { user, player, username, token, auth: { Authorization: `Bearer ${token}` } };
}
