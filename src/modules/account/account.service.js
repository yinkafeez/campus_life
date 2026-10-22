import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { bus, EVENTS } from '../../core/events.js';
import {
  AccommodationAssignment,
  ActivityAttempt,
  ActivityLog,
  Bill,
  CampaignItem,
  CampaignSupport,
  CampusEvent,
  Candidacy,
  Challenge,
  Character,
  CommunityGroup,
  CompetitionEntry,
  Conversation,
  Discovery,
  ElectionDispute,
  Friendship,
  GameAward,
  GameSession,
  GameStat,
  InventoryItem,
  Invitation,
  Job,
  LeaderAction,
  LeadershipAssignment,
  LearningProgress,
  LedgerEntry,
  Message,
  Player,
  PlayerRelation,
  Report,
  Session,
  StudentRecord,
  User,
  VoteReceipt,
  Wallet,
} from '../models.js';

/*
 * ACCOUNT — the player's own data rights:
 *   - change password (ends every other session)
 *   - export everything we hold about them (JSON)
 *   - delete the account
 *
 * DELETION POLICY (documented in docs/SECURITY.md):
 *   - erased: the login (email, username, password, sessions) and every personal record —
 *     character, wallet + ledger, items, studies, games, student record, hostel bed,
 *     friendships, blocks/mutes, invitations, discoveries, campaign support, vote receipts
 *   - kept but anonymised (the Player becomes "Deleted player"): things other people rely on —
 *     messages in their conversations (text replaced), certified election results,
 *     moderation reports (retained for safety, see the retention table)
 *   - ended: open challenges, a running candidacy, an active office, hosted future events;
 *     owned groups pass to another member (or close when empty)
 * Votes were never linked to the voter (secret ballot), so they stay in the counts.
 */
const trusted = (q) => mongoose.trusted(q);
export const DELETE_CONFIRMATION = 'DELETE MY ACCOUNT';
export const DELETED_NAME = 'Deleted player';

async function verifyPassword(userId, password) {
  const user = await User.findById(userId).select('+passwordHash +tokenVersion');
  if (!user || !(await user.correctPassword(password))) {
    throw new AppError('Your current password is incorrect.', 401, 'WRONG_PASSWORD');
  }
  return user;
}

// ─── Password ─────────────────────────────────────────────────────────────
/** Change the password; every access token and session is invalidated (the caller re-logs this device). */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await verifyPassword(userId, currentPassword);
  if (await user.correctPassword(newPassword)) {
    throw AppError.badRequest('Choose a password you are not already using.');
  }
  user.passwordHash = await User.hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  await Session.updateMany(
    { user: user._id, revokedAt: trusted({ $exists: false }) },
    { $set: { revokedAt: new Date(), revokedReason: 'password-changed' } },
  );
  return user;
}

// ─── Export ───────────────────────────────────────────────────────────────
const plain = (docs) => docs.map((d) => (d.toJSON ? d.toJSON() : d));

/** Everything stored about this player, as plain JSON (secrets and other players' data excluded). */
export async function exportAccount(userId) {
  const user = await User.findById(userId);
  const player = await Player.findOne({ user: userId });
  if (!user || !player) throw AppError.notFound('No account found.');
  const p = player._id;
  const by = (M, filter) => M.find(filter).lean();
  const [
    student,
    character,
    wallet,
    ledger,
    items,
    bills,
    discoveries,
    activities,
    progress,
    attempts,
    jobs,
    gameStats,
    gameAwards,
    accommodation,
    friendships,
    relations,
    messages,
    reports,
    candidacies,
    campaign,
    votedIn,
    offices,
    leaderActions,
    sessions,
  ] = await Promise.all([
    StudentRecord.findOne({ player: p }).lean(),
    Character.findOne({ player: p }).lean(),
    Wallet.findOne({ player: p }).lean(),
    by(LedgerEntry, { player: p }),
    by(InventoryItem, { player: p }),
    by(Bill, { player: p }),
    by(Discovery, { player: p }),
    by(ActivityLog, { player: p }),
    LearningProgress.find({ player: p }).lean(),
    ActivityAttempt.find({ player: p })
      .select(
        'activityKey level number status score maxScore percent passed xpAwarded createdAt submittedAt',
      )
      .lean(),
    Job.find({ player: p }).select('hustle template status percent pay acceptedAt').lean(),
    by(GameStat, { player: p }),
    by(GameAward, { player: p }),
    by(AccommodationAssignment, { player: p }),
    Friendship.find({ $or: [{ requester: p }, { recipient: p }] }).lean(),
    by(PlayerRelation, { owner: p }),
    Message.find({ sender: p }).select('conversation text createdAt').lean(),
    Report.find({ reporter: p }).select('target context reason details status createdAt').lean(),
    by(Candidacy, { player: p }),
    by(CampaignItem, { player: p }),
    VoteReceipt.find({ voter: p }).select('election createdAt').lean(),
    by(LeadershipAssignment, { player: p }),
    by(LeaderAction, { leader: p }),
    Session.find({ user: userId })
      .select('createdAt lastUsedAt expiresAt revokedAt userAgent')
      .lean(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    notice:
      'Campus Life is a game: admission, matric numbers, grades, money and elections here are simulated and fictional. ' +
      'Your votes are secret: we store only that you voted, never your choices.',
    account: plain([user])[0],
    player: plain([player])[0],
    student,
    character,
    economy: { wallet, ledger, items, bills },
    campus: { discoveries, activities },
    studies: { progress, attempts },
    work: { jobs },
    games: { stats: gameStats, awards: gameAwards },
    accommodation,
    social: { friendships, relations, messagesSent: messages, reportsFiled: reports },
    elections: { candidacies, campaign, votedIn, offices, leaderActions },
    sessions,
  };
}

// ─── Deletion ─────────────────────────────────────────────────────────────
/** Delete the account behind userId (see the policy above). Idempotent; returns a summary. */
export async function deleteAccount(userId, { password, confirm }) {
  if (confirm !== DELETE_CONFIRMATION) {
    throw AppError.badRequest(`Type "${DELETE_CONFIRMATION}" to confirm.`);
  }
  await verifyPassword(userId, password);
  const player = await Player.findOne({ user: userId });
  const summary = await erasePlayerData(player);
  await Session.collection.deleteMany({ user: userId });
  await User.collection.deleteOne({ _id: userId });
  if (player) bus.emit(EVENTS.ACCOUNT_DELETED, { playerId: String(player._id) });
  return summary;
}

/** Erase / anonymise everything tied to a player (also used by admins for removals). */
export async function erasePlayerData(player) {
  if (!player) return { erased: 0 };
  const p = player._id;
  const now = new Date();
  let erased = 0;
  const wipe = async (M, filter) => {
    erased += (await M.collection.deleteMany(filter)).deletedCount;
  };

  // 1) anonymise the in-game identity first: if a later step fails, nothing personal shows
  await Player.collection.updateOne(
    { _id: p },
    {
      $set: {
        displayName: DELETED_NAME,
        bio: '',
        deletedAt: now,
        privacy: {
          profileVisibility: 'nobody',
          messagesFrom: 'nobody',
          allowFriendRequests: false,
          showOnline: false,
          shareActivity: false,
        },
      },
      $unset: { gender: '' },
    },
  );

  // 2) end things other players are waiting on
  await Challenge.collection.updateMany(
    { $or: [{ challenger: p }, { opponent: p }], status: { $in: ['waiting', 'ready'] } },
    { $set: { status: 'declined', open: false } },
  );
  await Candidacy.collection.updateMany(
    { player: p, status: 'nominated' },
    { $set: { status: 'withdrawn', statusReason: 'Account deleted' } },
  );
  await LeadershipAssignment.collection.updateMany(
    { player: p, status: 'active' },
    { $set: { status: 'removed', endsAt: now } },
  );
  await CampusEvent.collection.updateMany(
    { host: p, endsAt: { $gte: now }, cancelledAt: { $exists: false } },
    { $set: { cancelledAt: now } },
  );
  await CampusEvent.collection.updateMany({ attendees: p }, { $pull: { attendees: p } });

  // groups: hand owned groups to the longest-standing member; close empty ones
  const owned = await CommunityGroup.find({ owner: p });
  for (const group of owned) {
    const heir = group.members.find((m) => String(m.player) !== String(p));
    if (heir) {
      // eslint-disable-next-line no-await-in-loop -- few groups per player
      await CommunityGroup.collection.updateOne(
        { _id: group._id },
        {
          $set: { owner: heir.player, 'members.$[h].role': 'owner' },
          $pull: { members: { player: p } },
        },
        { arrayFilters: [{ 'h.player': heir.player }] },
      );
    } else {
      // eslint-disable-next-line no-await-in-loop
      await CommunityGroup.collection.deleteOne({ _id: group._id });
      // eslint-disable-next-line no-await-in-loop
      await Conversation.collection.deleteOne({ group: group._id });
    }
  }
  await CommunityGroup.collection.updateMany(
    { 'members.player': p },
    { $pull: { members: { player: p } } },
  );

  // 3) messages others can still see: keep the thread, drop the words
  await Message.collection.updateMany(
    { sender: p },
    { $set: { text: '[message deleted]', masked: false } },
  );
  await Conversation.collection.updateMany(
    { 'lastMessage.sender': p },
    { $set: { 'lastMessage.preview': '[message deleted]' } },
  );
  // direct threads stay readable for the other person; the deleted player leaves group chats
  await Conversation.collection.updateMany(
    { type: 'group', 'members.player': p },
    { $pull: { members: { player: p } } },
  );

  // 4) personal records
  await wipe(Character, { player: p });
  await wipe(Wallet, { player: p });
  await wipe(LedgerEntry, { player: p });
  await wipe(InventoryItem, { player: p });
  await wipe(Bill, { player: p });
  await wipe(Job, { player: p });
  await wipe(Discovery, { player: p });
  await wipe(ActivityLog, { player: p });
  await wipe(LearningProgress, { player: p });
  await wipe(ActivityAttempt, { player: p });
  await wipe(GameSession, { player: p });
  await wipe(GameStat, { player: p });
  await wipe(GameAward, { player: p });
  await wipe(CompetitionEntry, { player: p });
  await wipe(AccommodationAssignment, { player: p });
  await wipe(StudentRecord, { player: p });
  await wipe(Friendship, { $or: [{ requester: p }, { recipient: p }] });
  await wipe(PlayerRelation, { $or: [{ owner: p }, { target: p }] });
  await wipe(Invitation, { $or: [{ from: p }, { to: p }] });
  await wipe(CampaignSupport, { player: p });
  await wipe(VoteReceipt, { voter: p });
  await wipe(ElectionDispute, { filedBy: p, status: 'open' });
  return { erased };
}
