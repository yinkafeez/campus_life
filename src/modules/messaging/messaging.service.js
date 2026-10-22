import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { bus, EVENTS } from '../../core/events.js';
import Player from '../players/player.model.js';
import { guardChat } from '../moderation/chatGuard.js';
import { pairKeyOf } from '../social/friendship.model.js';
import PlayerRelation from '../social/relation.model.js';
import {
  blockedEitherWay,
  canMessage,
  playerCard,
  usernamesFor,
} from '../social/social.service.js';
import Conversation from './conversation.model.js';
import Message from './message.model.js';

/*
 * MESSAGING — direct messages between players and group chats.
 * Safety rules on every message: blocks (either way), the recipient's "messages from"
 * privacy setting, moderator chat mutes, a rate limit and the text filter.
 */

const ids = (list) => mongoose.trusted({ $in: list });
const NOT_ALLOWED = () =>
  new AppError("You can't message this player.", 403, 'MESSAGING_NOT_ALLOWED');

const isMember = (conversation, playerId) =>
  conversation.members.some((el) => String(el.player) === String(playerId));

export const presentMessage = (msg) => ({
  id: msg._id,
  conversation: msg.conversation,
  sender: msg.sender,
  text: msg.text,
  masked: msg.masked,
  createdAt: msg.createdAt,
});

async function loadConversation(player, conversationId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !isMember(conversation, player._id))
    throw AppError.notFound('Conversation not found.');
  return conversation;
}

/** May `sender` message `recipient` (a Player doc) in this direct thread? */
async function assertDirectAllowed(sender, recipient, conversation) {
  if (await blockedEitherWay(sender._id, recipient._id)) throw NOT_ALLOWED();
  if (await canMessage(sender, recipient)) return;
  // replying is always fine once the other player has written to you in this thread
  const theyWrote =
    conversation &&
    (await Message.exists({ conversation: conversation._id, sender: recipient._id }));
  if (!theyWrote) throw NOT_ALLOWED();
}

/** Open (or find) the direct thread with another player. */
export async function openDirect(player, otherId) {
  if (String(otherId) === String(player._id))
    throw AppError.badRequest("You can't message yourself.");
  const other = await Player.findById(otherId);
  if (!other) throw AppError.notFound('Player not found.');

  const pairKey = pairKeyOf(player._id, other._id);
  let conversation = await Conversation.findOne({ pairKey });
  await assertDirectAllowed(player, other, conversation);
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        type: 'direct',
        pairKey,
        members: [{ player: player._id }, { player: other._id }],
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      conversation = await Conversation.findOne({ pairKey }); // opened at the same moment
    }
  }
  return conversation;
}

/** The chat of a community group I belong to. */
export async function openGroup(player, groupId) {
  const conversation = await Conversation.findOne({ group: groupId, 'members.player': player._id });
  if (!conversation) throw AppError.notFound('Join the group to see its chat.');
  return conversation;
}

/** Send a message in a conversation the player belongs to. */
export async function sendMessage(player, conversationId, rawText) {
  const conversation = await loadConversation(player, conversationId);
  let recipients = conversation.members
    .map((el) => String(el.player))
    .filter((id) => id !== String(player._id));

  if (conversation.type === 'direct') {
    const other = await Player.findById(recipients[0]);
    if (!other) throw NOT_ALLOWED();
    await assertDirectAllowed(player, other, conversation);
  } else {
    // in a group, players who blocked (or were blocked by) the sender don't receive it live
    const blocks = await PlayerRelation.find({
      type: 'block',
      $or: [
        { owner: player._id, target: ids(recipients) },
        { owner: ids(recipients), target: player._id },
      ],
    }).select('owner target');
    const hidden = new Set(
      blocks.map((el) => String(String(el.owner) === String(player._id) ? el.target : el.owner)),
    );
    recipients = recipients.filter((id) => !hidden.has(id));
  }

  const { text, masked } = await guardChat(player._id, rawText);
  const message = await Message.create({
    conversation: conversation._id,
    sender: player._id,
    text,
    masked,
  });

  await Conversation.updateOne(
    { _id: conversation._id, 'members.player': player._id },
    {
      $set: {
        lastMessageAt: message.createdAt,
        lastMessage: { sender: player._id, preview: text.slice(0, 80) },
        'members.$.lastReadAt': message.createdAt,
      },
    },
  );

  // players who muted the sender still get the message in their inbox, just no live ping
  const muters = await PlayerRelation.find({
    type: 'mute',
    target: player._id,
    owner: ids(recipients),
  }).select('owner');
  const muted = new Set(muters.map((el) => String(el.owner)));
  bus.emit(EVENTS.MESSAGE_SENT, {
    toPlayerIds: recipients.filter((id) => !muted.has(id)),
    message: presentMessage(message),
    from: { playerId: String(player._id), displayName: player.displayName },
  });
  return message;
}

/** Messages, newest first, `limit` at a time; pass the oldest id you have as `before` for more. */
export async function listMessages(player, conversationId, { before, limit = 30 } = {}) {
  const conversation = await loadConversation(player, conversationId);
  const filter = { conversation: conversation._id };
  if (before) filter._id = mongoose.trusted({ $lt: new mongoose.Types.ObjectId(before) });
  const messages = await Message.find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1);
  const hasMore = messages.length > limit;
  return { messages: messages.slice(0, limit).map(presentMessage), hasMore };
}

export async function markRead(player, conversationId) {
  const conversation = await loadConversation(player, conversationId);
  await Conversation.updateOne(
    { _id: conversation._id, 'members.player': player._id },
    { $set: { 'members.$.lastReadAt': new Date() } },
  );
}

/** The player's inbox: direct threads (with the other player) and group chats. */
export async function listConversations(player) {
  const conversations = await Conversation.find({
    'members.player': player._id,
    lastMessageAt: mongoose.trusted({ $exists: true }),
  })
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .populate('group', 'name slug');

  const otherIds = conversations
    .filter((el) => el.type === 'direct')
    .map((el) => el.members.find((m) => String(m.player) !== String(player._id))?.player)
    .filter(Boolean);
  const others = await Player.find({ _id: ids(otherIds) });
  const byId = new Map(others.map((el) => [String(el._id), el]));
  const names = await usernamesFor(others);
  const blocked = await PlayerRelation.find({
    type: 'block',
    $or: [{ owner: player._id }, { target: player._id }],
  }).select('owner target');
  const hidden = new Set(
    blocked.map((el) => String(String(el.owner) === String(player._id) ? el.target : el.owner)),
  );

  return conversations
    .map((conv) => {
      const me = conv.members.find((m) => String(m.player) === String(player._id));
      const unread =
        Boolean(conv.lastMessageAt) &&
        String(conv.lastMessage?.sender) !== String(player._id) &&
        conv.lastMessageAt > (me?.lastReadAt ?? new Date(0));
      const base = {
        id: conv._id,
        type: conv.type,
        lastMessageAt: conv.lastMessageAt,
        lastMessage: conv.lastMessage?.preview ?? null,
        unread,
      };
      if (conv.type === 'group') {
        return {
          ...base,
          group: conv.group
            ? { id: conv.group._id, name: conv.group.name, slug: conv.group.slug }
            : null,
        };
      }
      const otherId = conv.members.find((m) => String(m.player) !== String(player._id))?.player;
      if (!otherId || hidden.has(String(otherId)) || !byId.has(String(otherId))) return null;
      const other = byId.get(String(otherId));
      return { ...base, with: playerCard(other, names.get(String(other.user))) };
    })
    .filter(Boolean);
}

// ─── Group conversations (used by the community module) ──────────────────
export async function groupConversation(groupId, memberIds) {
  return Conversation.findOneAndUpdate(
    { group: groupId },
    {
      $setOnInsert: {
        type: 'group',
        group: groupId,
        members: memberIds.map((player) => ({ player })),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
}

export async function addConversationMember(groupId, playerId) {
  await Conversation.updateOne(
    { group: groupId, 'members.player': mongoose.trusted({ $ne: playerId }) },
    { $push: { members: { player: playerId, lastReadAt: new Date() } } },
  );
}

export async function removeConversationMember(groupId, playerId) {
  await Conversation.updateOne({ group: groupId }, { $pull: { members: { player: playerId } } });
}
