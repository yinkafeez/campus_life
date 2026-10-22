import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { bus, EVENTS } from '../../core/events.js';
import User from '../auth/user.model.js';
import Player from '../players/player.model.js';
import Conversation from '../messaging/conversation.model.js';
import Message from '../messaging/message.model.js';
import Report from './report.model.js';
import { findChat } from './chatLog.js';

/*
 * REPORTS & MODERATION
 * Players report behaviour; the server attaches the evidence itself (the reported message
 * or zone-chat line), so reports can't be faked by typing text. Moderators (admins) review
 * and act: warn, pause chat, or suspend the account for a number of hours.
 */

const MAX_REPORTS_PER_DAY = 10;

async function evidenceFor(reporter, targetId, { context, messageId, chatId }) {
  if (context === 'message') {
    if (!messageId) throw AppError.badRequest('Say which message you are reporting.');
    const message = await Message.findById(messageId);
    const conversation = message && (await Conversation.findById(message.conversation));
    const reporterIn = conversation?.members.some((m) => String(m.player) === String(reporter._id));
    if (!message || !reporterIn || String(message.sender) !== String(targetId)) {
      throw AppError.notFound('Message not found.');
    }
    return { messageId: message._id, text: message.text, saidAt: message.createdAt };
  }
  if (context === 'chat') {
    const line = chatId && findChat(chatId);
    if (!line || line.sender !== String(targetId)) {
      throw AppError.notFound(
        'That chat line is no longer available. Describe what happened instead.',
      );
    }
    return { text: line.text, saidAt: line.at };
  }
  return undefined;
}

export async function createReport(
  reporter,
  { targetId, context, reason, details, messageId, chatId },
) {
  if (String(targetId) === String(reporter._id))
    throw AppError.badRequest("You can't report yourself.");
  if (!(await Player.exists({ _id: targetId }))) throw AppError.notFound('Player not found.');

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await Report.countDocuments({
    reporter: reporter._id,
    createdAt: mongoose.trusted({ $gte: since }),
  });
  if (recent >= MAX_REPORTS_PER_DAY) {
    throw new AppError(
      'You have sent many reports today. Our moderators are reviewing them.',
      429,
      'REPORT_LIMIT',
    );
  }
  // one open report per person, reason and place is enough
  const duplicate = await Report.exists({
    reporter: reporter._id,
    target: targetId,
    context,
    reason,
    status: 'open',
  });
  if (duplicate)
    throw new AppError(
      'You already reported this. Moderators will review it.',
      409,
      'REPORT_EXISTS',
    );

  const evidence = await evidenceFor(reporter, targetId, { context, messageId, chatId });
  return Report.create({
    reporter: reporter._id,
    target: targetId,
    context,
    reason,
    details,
    evidence,
  });
}

// ─── Moderator side ───────────────────────────────────────────────────────
export async function listReports({ status = 'open', limit = 50 } = {}) {
  const reports = await Report.find({ status }).sort({ createdAt: -1 }).limit(limit).lean();
  const playerIds = [...new Set(reports.flatMap((el) => [String(el.reporter), String(el.target)]))];
  const players = await Player.find({ _id: mongoose.trusted({ $in: playerIds }) }).select(
    'displayName user',
  );
  const users = await User.find({
    _id: mongoose.trusted({ $in: players.map((el) => el.user) }),
  }).select('username');
  const names = new Map(users.map((el) => [String(el._id), el.username]));
  const who = new Map(
    players.map((el) => [
      String(el._id),
      { playerId: el._id, displayName: el.displayName, username: names.get(String(el.user)) },
    ]),
  );
  return reports.map((el) => ({
    ...el,
    reporter: who.get(String(el.reporter)) ?? null,
    target: who.get(String(el.target)) ?? null,
  }));
}

/** A player's moderation record: reports about them and current sanctions. */
export async function moderationHistory(playerId) {
  const player = await Player.findById(playerId).select(
    '+chatMutedUntil displayName user deletedAt',
  );
  if (!player) throw AppError.notFound('Player not found.');
  const user = await User.findById(player.user).select('+suspendedUntil username');
  const reports = await Report.find({ target: player._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const now = new Date();
  return {
    player: {
      playerId: player._id,
      displayName: player.displayName,
      username: user?.username ?? null,
      deleted: Boolean(player.deletedAt),
    },
    sanctions: {
      chatMutedUntil: player.chatMutedUntil > now ? player.chatMutedUntil : null,
      suspendedUntil: user?.suspendedUntil > now ? user.suspendedUntil : null,
    },
    reports,
  };
}

/** Lift a mute and/or suspension early (mistakes happen; appeals). */
export async function liftSanctions(playerId, { note }, actor) {
  const player = await Player.findById(playerId).select('user');
  if (!player) throw AppError.notFound('Player not found.');
  await Player.updateOne({ _id: player._id }, { $unset: { chatMutedUntil: '' } });
  await User.updateOne({ _id: player.user }, { $unset: { suspendedUntil: '' } });
  bus.emit(EVENTS.MODERATION_ACTION, {
    toPlayerId: String(player._id),
    action: 'lifted',
    until: null,
    reason: note,
  });
  return { lifted: true, by: actor, at: new Date() };
}

/** Resolve a report. action: none (dismiss) | warn | mute-chat | suspend (with durationHours). */
export async function resolveReport(reportId, { action, durationHours, note }, actor) {
  const report = await Report.findOne({ _id: reportId, status: 'open' });
  if (!report) throw AppError.notFound('No open report with that id.');
  const until = durationHours ? new Date(Date.now() + durationHours * 60 * 60 * 1000) : null;

  if (action === 'mute-chat') {
    await Player.updateOne({ _id: report.target }, { $set: { chatMutedUntil: until } });
  } else if (action === 'suspend') {
    const target = await Player.findById(report.target).select('user');
    if (target) await User.updateOne({ _id: target.user }, { $set: { suspendedUntil: until } });
  }

  report.status = action === 'none' ? 'dismissed' : 'actioned';
  report.resolution = { action, durationHours, note, by: actor, at: new Date() };
  await report.save();

  if (action !== 'none') {
    bus.emit(EVENTS.MODERATION_ACTION, {
      toPlayerId: String(report.target),
      action,
      until,
      reason: report.reason,
    });
  }
  return report;
}
