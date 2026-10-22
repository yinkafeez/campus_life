import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { bus, EVENTS } from '../../core/events.js';
import { isOnline } from '../../core/realtime/presence.js';
import User from '../auth/user.model.js';
import Player from '../players/player.model.js';
import StudentRecord from '../students/studentRecord.model.js';
import University from '../universities/university.model.js';
import Friendship, { pairKeyOf } from './friendship.model.js';
import PlayerRelation from './relation.model.js';

/*
 * SOCIAL GRAPH — friendships, blocks, mutes and privacy-aware profiles.
 * Personal data (email, real identity) is never part of any social response.
 */

const ids = (list) => mongoose.trusted({ $in: list });

export async function blockedEitherWay(a, b) {
  return Boolean(
    await PlayerRelation.exists({
      type: 'block',
      $or: [
        { owner: a, target: b },
        { owner: b, target: a },
      ],
    }),
  );
}

export async function areFriends(a, b) {
  return Boolean(await Friendship.exists({ pairKey: pairKeyOf(a, b), status: 'accepted' }));
}

/** Players `playerId` has blocked or been blocked by (they never see each other). */
export async function hiddenPlayerIds(playerId) {
  const rows = await PlayerRelation.find({
    type: 'block',
    $or: [{ owner: playerId }, { target: playerId }],
  }).select('owner target');
  return new Set(
    rows.map((el) => String(String(el.owner) === String(playerId) ? el.target : el.owner)),
  );
}

export async function friendIds(playerId) {
  const rows = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: playerId }, { recipient: playerId }],
  }).select('requester recipient');
  return rows.map((el) =>
    String(String(el.requester) === String(playerId) ? el.recipient : el.requester),
  );
}

/** Can `viewer` reach `target` for something guarded by an audience setting? */
async function audienceAllows(audience, viewerId, targetId) {
  if (String(viewerId) === String(targetId)) return true;
  if (audience === 'everyone') return true;
  if (audience === 'friends') return areFriends(viewerId, targetId);
  return false;
}

export const canMessage = (sender, recipient) =>
  audienceAllows(recipient.privacy?.messagesFrom ?? 'friends', sender._id, recipient._id);

// ─── Lookups ──────────────────────────────────────────────────────────────
export const playerCard = (player, username, extra = {}) => ({
  playerId: player._id,
  username,
  displayName: player.displayName,
  online: player.privacy?.showOnline === false ? null : isOnline(player._id),
  ...extra,
});

export async function usernamesFor(players) {
  const users = await User.find({ _id: ids(players.map((el) => el.user)) }).select('username');
  return new Map(users.map((el) => [String(el._id), el.username]));
}

export async function findPlayerByUsername(username) {
  const user = await User.findOne({ username: String(username).trim().toLowerCase() }).select(
    '_id username',
  );
  const player = user && (await Player.findOne({ user: user._id }));
  if (!player) throw AppError.notFound('No player with that username.');
  return { player, username: user.username };
}

/** A player's public profile as `viewer` may see it. */
export async function publicProfile(viewer, username) {
  const { player, username: name } = await findPlayerByUsername(username);
  if (await blockedEitherWay(viewer._id, player._id))
    throw AppError.notFound('No player with that username.');

  const self = String(viewer._id) === String(player._id);
  const friendship = self
    ? null
    : await Friendship.findOne({ pairKey: pairKeyOf(viewer._id, player._id) });
  const visible = await audienceAllows(
    player.privacy?.profileVisibility ?? 'everyone',
    viewer._id,
    player._id,
  );

  let relationship = 'none';
  if (self) relationship = 'self';
  else if (friendship?.status === 'accepted') relationship = 'friends';
  else if (friendship)
    relationship =
      String(friendship.requester) === String(viewer._id) ? 'request-sent' : 'request-received';

  const base = playerCard(player, name, { relationship, friendshipId: friendship?._id ?? null });
  if (!visible) return { ...base, private: true };

  const record = await StudentRecord.findOne({ player: player._id }).select(
    'university currentLevel status',
  );
  const university =
    record && (await University.findById(record.university).select('shortName name config'));
  return {
    ...base,
    private: false,
    bio: player.bio ?? null,
    university: university ? { shortName: university.shortName, name: university.name } : null,
    level:
      record && ['matriculated', 'active'].includes(record.status) ? record.currentLevel : null,
    canMessage: self ? false : await canMessage(viewer, player),
  };
}

export async function searchPlayers(viewer, query) {
  const q = String(query)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '');
  if (q.length < 2) return [];
  const users = await User.find({ username: new RegExp(`^${q}`) })
    .select('username')
    .limit(15);
  const players = await Player.find({ user: ids(users.map((el) => el._id)) });
  const hidden = await hiddenPlayerIds(viewer._id);
  const names = new Map(users.map((el) => [String(el._id), el.username]));
  return (
    players
      // people who chose "nobody can see my profile" (and deleted accounts) aren't searchable
      .filter(
        (el) =>
          String(el._id) !== String(viewer._id) &&
          !hidden.has(String(el._id)) &&
          el.privacy?.profileVisibility !== 'nobody' &&
          !el.deletedAt,
      )
      .map((el) => playerCard(el, names.get(String(el.user))))
  );
}

// ─── Friendships ──────────────────────────────────────────────────────────
export const MAX_PENDING_REQUESTS = 30;
export async function sendFriendRequest(from, username) {
  const { player: to } = await findPlayerByUsername(username);
  if (String(to._id) === String(from._id)) throw AppError.badRequest("You can't add yourself.");
  // a blocked player sees the same answer as a closed inbox — blocking stays private
  if ((await blockedEitherWay(from._id, to._id)) || to.privacy?.allowFriendRequests === false) {
    throw new AppError(
      'This player is not accepting friend requests.',
      403,
      'FRIEND_REQUESTS_CLOSED',
    );
  }

  const pairKey = pairKeyOf(from._id, to._id);
  const existing = await Friendship.findOne({ pairKey });
  if (existing?.status === 'accepted')
    throw new AppError('You are already friends.', 409, 'ALREADY_FRIENDS');
  if (existing && String(existing.recipient) === String(from._id)) {
    // they had already asked me: asking back = accepting
    return acceptFriendRequest(from, existing._id);
  }
  if (existing) throw new AppError('Friend request already sent.', 409, 'REQUEST_PENDING');
  // no spamming strangers: a cap on requests still waiting for an answer
  if (
    (await Friendship.countDocuments({ requester: from._id, status: 'pending' })) >=
    MAX_PENDING_REQUESTS
  )
    throw new AppError(
      `You have ${MAX_PENDING_REQUESTS} friend requests waiting. Wait for answers before sending more.`,
      429,
      'TOO_MANY_REQUESTS',
    );

  const request = await Friendship.create({ pairKey, requester: from._id, recipient: to._id });
  bus.emit(EVENTS.FRIEND_REQUEST, {
    toPlayerId: String(to._id),
    from: { playerId: String(from._id), displayName: from.displayName },
    requestId: String(request._id),
  });
  return request;
}

export async function acceptFriendRequest(player, requestId) {
  const request = await Friendship.findOneAndUpdate(
    { _id: requestId, recipient: player._id, status: 'pending' },
    { $set: { status: 'accepted', acceptedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!request) throw AppError.notFound('No pending friend request found.');
  bus.emit(EVENTS.FRIEND_ACCEPTED, {
    toPlayerId: String(request.requester),
    by: { playerId: String(player._id), displayName: player.displayName },
  });
  return request;
}

export async function declineFriendRequest(player, requestId) {
  // the recipient declines, or the requester cancels
  const removed = await Friendship.findOneAndDelete({
    _id: requestId,
    status: 'pending',
    $or: [{ recipient: player._id }, { requester: player._id }],
  });
  if (!removed) throw AppError.notFound('No pending friend request found.');
}

export async function removeFriend(player, otherId) {
  await Friendship.deleteOne({ pairKey: pairKeyOf(player._id, otherId) });
}

export async function listFriends(player) {
  const rows = await Friendship.find({
    $or: [{ requester: player._id }, { recipient: player._id }],
  }).sort({ updatedAt: -1 });
  const otherIds = rows.map((el) =>
    String(el.requester) === String(player._id) ? el.recipient : el.requester,
  );
  const players = await Player.find({ _id: ids(otherIds) });
  const byId = new Map(players.map((el) => [String(el._id), el]));
  const names = await usernamesFor(players);

  const result = { friends: [], incoming: [], outgoing: [] };
  rows.forEach((row) => {
    const otherId = String(row.requester) === String(player._id) ? row.recipient : row.requester;
    const other = byId.get(String(otherId));
    if (!other) return;
    const card = playerCard(other, names.get(String(other.user)), { friendshipId: row._id });
    if (row.status === 'accepted') result.friends.push(card);
    else if (String(row.recipient) === String(player._id)) result.incoming.push(card);
    else result.outgoing.push(card);
  });
  return result;
}

// ─── Blocks & mutes ───────────────────────────────────────────────────────
export async function addRelation(player, targetId, type) {
  if (String(targetId) === String(player._id))
    throw AppError.badRequest("You can't do that to yourself.");
  if (!(await Player.exists({ _id: targetId }))) throw AppError.notFound('Player not found.');
  await PlayerRelation.updateOne(
    { owner: player._id, target: targetId, type },
    { $setOnInsert: { owner: player._id, target: targetId, type } },
    { upsert: true },
  );
  // blocking also ends any friendship or pending request
  if (type === 'block') await Friendship.deleteOne({ pairKey: pairKeyOf(player._id, targetId) });
  bus.emit(EVENTS.RELATION_CHANGED, { playerIds: [String(player._id), String(targetId)] });
}

export async function removeRelation(player, targetId, type) {
  await PlayerRelation.deleteOne({ owner: player._id, target: targetId, type });
  bus.emit(EVENTS.RELATION_CHANGED, { playerIds: [String(player._id), String(targetId)] });
}

export async function listRelations(player) {
  const rows = await PlayerRelation.find({ owner: player._id });
  const players = await Player.find({ _id: ids(rows.map((el) => el.target)) });
  const names = await usernamesFor(players);
  const byId = new Map(players.map((el) => [String(el._id), el]));
  const pick = (type) =>
    rows
      .filter((el) => el.type === type && byId.has(String(el.target)))
      .map((el) => {
        const p = byId.get(String(el.target));
        return { playerId: p._id, username: names.get(String(p.user)), displayName: p.displayName };
      });
  return { blocked: pick('block'), muted: pick('mute') };
}
