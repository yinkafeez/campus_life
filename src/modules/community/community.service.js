import mongoose from '../../core/db/mongoose.js';
import AppError from '../../core/errors/AppError.js';
import { bus, EVENTS } from '../../core/events.js';
import Player from '../players/player.model.js';
import CampusLocation from '../campus/campusLocation.model.js';
import { universityOfPlayer } from '../campus/campus.service.js';
import { filterText } from '../moderation/textFilter.js';
import { assertNotChatMuted } from '../moderation/chatGuard.js';
import {
  addConversationMember,
  groupConversation,
  removeConversationMember,
} from '../messaging/messaging.service.js';
import {
  areFriends,
  blockedEitherWay,
  friendIds,
  hiddenPlayerIds,
} from '../social/social.service.js';
import StudentRecord from '../students/studentRecord.model.js';
import AccommodationAssignment from '../accommodation/assignment.model.js';
import { CampusEvent, CommunityGroup, Invitation, MAX_GROUP_MEMBERS } from './community.models.js';

const MAX_OWNED_GROUPS = 5;
const MAX_UPCOMING_HOSTED = 10;
const MAX_EVENT_HOURS = 12;
const MAX_DAYS_AHEAD = 60;

const trusted = (q) => mongoose.trusted(q);
const clean = (text) => (text ? filterText(text, { isPublic: true }).text : text);
const isMemberOf = (group, playerId) =>
  group.members.some((m) => String(m.player) === String(playerId));

async function requireUniversity(player) {
  const university = await universityOfPlayer(player._id);
  if (!university)
    throw new AppError('Enrol at a university to join campus life.', 409, 'NOT_ENROLLED');
  return university;
}

const presentGroup = (group, viewerId) => ({
  id: group._id,
  name: group.name,
  description: group.description ?? null,
  kind: group.kind,
  visibility: group.visibility,
  memberCount: group.members.length,
  isMember: isMemberOf(group, viewerId),
  isOwner: String(group.owner) === String(viewerId),
});

// ─── Groups ───────────────────────────────────────────────────────────────
export async function listGroups(player) {
  const university = await requireUniversity(player);
  const groups = await CommunityGroup.find({
    university: university._id,
    $or: [{ visibility: 'public' }, { 'members.player': player._id }],
  })
    .sort({ updatedAt: -1 })
    .limit(100);
  return groups.map((el) => presentGroup(el, player._id));
}

export async function createGroup(player, { name, description, kind, visibility }) {
  const university = await requireUniversity(player);
  await assertNotChatMuted(player._id);
  if ((await CommunityGroup.countDocuments({ owner: player._id })) >= MAX_OWNED_GROUPS) {
    throw new AppError(`You can run at most ${MAX_OWNED_GROUPS} groups.`, 409, 'GROUP_LIMIT');
  }
  try {
    const group = await CommunityGroup.create({
      university: university._id,
      name: clean(name),
      description: clean(description),
      kind,
      visibility,
      owner: player._id,
      members: [{ player: player._id, role: 'owner' }],
    });
    await groupConversation(group._id, [player._id]);
    return presentGroup(group, player._id);
  } catch (err) {
    if (err.code === 11000) throw AppError.conflict('A group with that name already exists.');
    throw err;
  }
}

async function addMember(group, playerId) {
  const updated = await CommunityGroup.findOneAndUpdate(
    {
      _id: group._id,
      'members.player': trusted({ $ne: playerId }),
      [`members.${MAX_GROUP_MEMBERS - 1}`]: trusted({ $exists: false }),
    },
    { $push: { members: { player: playerId, role: 'member' } } },
    { returnDocument: 'after' },
  );
  if (!updated) {
    if (isMemberOf(group, playerId)) return group;
    throw new AppError('This group is full.', 409, 'GROUP_FULL');
  }
  await addConversationMember(group._id, playerId);
  return updated;
}

export async function joinGroup(player, groupId) {
  const university = await requireUniversity(player);
  const group = await CommunityGroup.findOne({ _id: groupId, university: university._id });
  if (!group) throw AppError.notFound('Group not found.');
  if (group.visibility !== 'public') {
    const invited = await Invitation.exists({
      to: player._id,
      group: group._id,
      status: 'pending',
    });
    if (!invited) throw AppError.forbidden('This group is invite-only.');
  }
  return presentGroup(await addMember(group, player._id), player._id);
}

export async function leaveGroup(player, groupId) {
  const group = await CommunityGroup.findById(groupId);
  if (!group || !isMemberOf(group, player._id))
    throw AppError.notFound('You are not in that group.');
  if (String(group.owner) === String(player._id)) {
    // the owner leaving hands the group to the longest-standing member, or closes it
    const next = group.members.find((m) => String(m.player) !== String(player._id));
    if (!next) {
      await CommunityGroup.deleteOne({ _id: group._id });
      return;
    }
    group.owner = next.player;
    next.role = 'owner';
  }
  group.members = group.members.filter((m) => String(m.player) !== String(player._id));
  await group.save();
  await removeConversationMember(group._id, player._id);
}

// ─── Events / hangouts ────────────────────────────────────────────────────
async function canSeeEvent(event, playerId, friendsOfHost) {
  if (String(event.host) === String(playerId)) return true;
  if (event.visibility === 'public') return true;
  if (event.visibility === 'friends')
    return friendsOfHost ? friendsOfHost.has(String(playerId)) : areFriends(event.host, playerId);
  if (event.visibility === 'group' && event.group) {
    return Boolean(await CommunityGroup.exists({ _id: event.group, 'members.player': playerId }));
  }
  return false;
}

const presentEvent = (event, viewerId, locationName) => ({
  id: event._id,
  title: event.title,
  description: event.description ?? null,
  kind: event.kind,
  host: event.host,
  group: event.group ?? null,
  location: { slug: event.locationSlug, name: locationName ?? event.locationSlug },
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  visibility: event.visibility,
  capacity: event.capacity,
  attending: event.attendees.length,
  isAttending: event.attendees.some((id) => String(id) === String(viewerId)),
  isHost: String(event.host) === String(viewerId),
  official: event.official?.positionCode
    ? { positionCode: event.official.positionCode, title: event.official.title }
    : null,
});

/** The scopes a student belongs to (for official, scope-limited events). */
export async function studentScopes(playerId) {
  const [record, bed] = await Promise.all([
    StudentRecord.findOne({ player: playerId }).select('faculty department'),
    AccommodationAssignment.findOne({ player: playerId, status: 'active' }).select('hostel'),
  ]);
  return { faculty: record?.faculty, department: record?.department, hall: bed?.hostel };
}

export const audienceIncludes = (audience, scopes) =>
  !audience?.type ||
  audience.type === 'university' ||
  String(scopes[audience.type] ?? '') === String(audience.unit);

export async function listEvents(player) {
  const university = await requireUniversity(player);
  const [events, hidden, myFriends, myGroups] = await Promise.all([
    CampusEvent.find({
      university: university._id,
      cancelledAt: trusted({ $exists: false }),
      endsAt: trusted({ $gte: new Date() }),
    })
      .sort({ startsAt: 1 })
      .limit(100),
    hiddenPlayerIds(player._id),
    friendIds(player._id),
    CommunityGroup.find({ 'members.player': player._id }).select('_id'),
  ]);
  const friends = new Set(myFriends);
  const scopes = await studentScopes(player._id);
  const groups = new Set(myGroups.map((el) => String(el._id)));
  const visible = events.filter((ev) => {
    if (hidden.has(String(ev.host))) return false;
    if (!audienceIncludes(ev.audience, scopes)) return false;
    if (String(ev.host) === String(player._id) || ev.visibility === 'public') return true;
    if (ev.visibility === 'friends') return friends.has(String(ev.host));
    return ev.group && groups.has(String(ev.group));
  });
  const locations = await CampusLocation.find({
    university: university._id,
    slug: trusted({ $in: [...new Set(visible.map((el) => el.locationSlug))] }),
  }).select('slug name');
  const names = new Map(locations.map((el) => [el.slug, el.name]));
  return visible.map((ev) => presentEvent(ev, player._id, names.get(ev.locationSlug)));
}

export async function createEvent(player, input) {
  const university = await requireUniversity(player);
  await assertNotChatMuted(player._id);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const now = Date.now();
  if (startsAt.getTime() < now - 5 * 60 * 1000)
    throw AppError.badRequest('An event cannot start in the past.');
  if (startsAt.getTime() > now + MAX_DAYS_AHEAD * 24 * 3600 * 1000) {
    throw AppError.badRequest(`Plan events at most ${MAX_DAYS_AHEAD} days ahead.`);
  }
  if (endsAt <= startsAt || endsAt - startsAt > MAX_EVENT_HOURS * 3600 * 1000) {
    throw AppError.badRequest(
      `An event must end after it starts and last at most ${MAX_EVENT_HOURS} hours.`,
    );
  }
  const location = await CampusLocation.findOne({
    university: university._id,
    slug: input.locationSlug,
  }).select('name world');
  if (!location?.world) throw AppError.badRequest('Pick a place that is in the game world.');

  let group = null;
  if (input.groupId) {
    group = await CommunityGroup.findOne({
      _id: input.groupId,
      university: university._id,
      'members.player': player._id,
    });
    if (!group) throw AppError.forbidden('You can only host events for groups you are in.');
  }
  if (input.visibility === 'group' && !group)
    throw AppError.badRequest('A group event needs a group.');

  const upcoming = await CampusEvent.countDocuments({
    host: player._id,
    endsAt: trusted({ $gte: new Date() }),
    cancelledAt: trusted({ $exists: false }),
  });
  if (upcoming >= MAX_UPCOMING_HOSTED) {
    throw new AppError(
      `You already host ${MAX_UPCOMING_HOSTED} upcoming events.`,
      409,
      'EVENT_LIMIT',
    );
  }

  const event = await CampusEvent.create({
    university: university._id,
    title: clean(input.title),
    description: clean(input.description),
    kind: input.kind,
    host: player._id,
    group: group?._id,
    locationSlug: input.locationSlug,
    startsAt,
    endsAt,
    visibility: input.visibility,
    capacity: input.capacity,
    attendees: [player._id],
  });
  return presentEvent(event, player._id, location.name);
}

export async function rsvp(player, eventId, going) {
  const university = await requireUniversity(player);
  const event = await CampusEvent.findOne({
    _id: eventId,
    university: university._id, // never another university's events
    cancelledAt: trusted({ $exists: false }),
  });
  if (
    !event ||
    !(await canSeeEvent(event, player._id)) ||
    (await blockedEitherWay(event.host, player._id)) ||
    !audienceIncludes(event.audience, await studentScopes(player._id))
  ) {
    throw AppError.notFound('Event not found.');
  }
  if (!going) {
    if (String(event.host) === String(player._id))
      throw AppError.badRequest('Hosts cancel the event instead.');
    await CampusEvent.updateOne({ _id: event._id }, { $pull: { attendees: player._id } });
    return;
  }
  if (event.endsAt < new Date()) throw AppError.badRequest('This event has ended.');
  const updated = await CampusEvent.findOneAndUpdate(
    {
      _id: event._id,
      attendees: trusted({ $ne: player._id }),
      $expr: trusted({ $lt: [{ $size: '$attendees' }, '$capacity'] }),
    },
    { $push: { attendees: player._id } },
    { returnDocument: 'after' },
  );
  if (!updated && !event.attendees.some((id) => String(id) === String(player._id))) {
    throw new AppError('This event is full.', 409, 'EVENT_FULL');
  }
}

export async function cancelEvent(player, eventId) {
  const event = await CampusEvent.findOneAndUpdate(
    { _id: eventId, host: player._id, cancelledAt: trusted({ $exists: false }) },
    { $set: { cancelledAt: new Date() } },
  );
  if (!event) throw AppError.notFound('Event not found.');
}

// ─── Invitations (friends only) ───────────────────────────────────────────
export async function invite(player, { toPlayerId, groupId, eventId }) {
  if (!groupId === !eventId) throw AppError.badRequest('Invite to a group or an event.');
  if (String(toPlayerId) === String(player._id))
    throw AppError.badRequest("You can't invite yourself.");
  const to = await Player.findById(toPlayerId);
  if (
    !to ||
    (await blockedEitherWay(player._id, to._id)) ||
    !(await areFriends(player._id, to._id))
  ) {
    throw new AppError('You can only invite your friends.', 403, 'INVITE_NOT_ALLOWED');
  }

  let target;
  if (groupId) {
    target = await CommunityGroup.findOne({ _id: groupId, 'members.player': player._id });
    if (!target) throw AppError.notFound('Group not found.');
    if (isMemberOf(target, to._id)) throw AppError.conflict('They are already in this group.');
  } else {
    const university = await requireUniversity(player);
    target = await CampusEvent.findOne({
      _id: eventId,
      university: university._id,
      cancelledAt: trusted({ $exists: false }),
    });
    if (!target || !(await canSeeEvent(target, player._id)))
      throw AppError.notFound('Event not found.');
  }

  try {
    const invitation = await Invitation.create({
      from: player._id,
      to: to._id,
      kind: groupId ? 'group' : 'event',
      group: groupId,
      event: eventId,
    });
    bus.emit(EVENTS.INVITATION_SENT, {
      toPlayerId: String(to._id),
      invitationId: String(invitation._id),
      kind: invitation.kind,
      title: groupId ? target.name : target.title,
      from: { playerId: String(player._id), displayName: player.displayName },
    });
    return invitation;
  } catch (err) {
    if (err.code === 11000) throw AppError.conflict('They already have an invitation to this.');
    throw err;
  }
}

export async function listInvitations(player) {
  const invitations = await Invitation.find({ to: player._id, status: 'pending' })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('from', 'displayName')
    .populate('group', 'name')
    .populate('event', 'title startsAt locationSlug');
  const hidden = await hiddenPlayerIds(player._id);
  return invitations
    .filter((el) => el.from && !hidden.has(String(el.from._id)))
    .map((el) => ({
      id: el._id,
      kind: el.kind,
      from: { playerId: el.from._id, displayName: el.from.displayName },
      group: el.group ? { id: el.group._id, name: el.group.name } : null,
      event: el.event
        ? {
            id: el.event._id,
            title: el.event.title,
            startsAt: el.event.startsAt,
            locationSlug: el.event.locationSlug,
          }
        : null,
      createdAt: el.createdAt,
    }));
}

export async function respondToInvitation(player, invitationId, accept) {
  const invitation = await Invitation.findOne({
    _id: invitationId,
    to: player._id,
    status: 'pending',
  });
  if (!invitation) throw AppError.notFound('Invitation not found.');
  if (accept) {
    // an invitation is not a way around the rules: same university, no blocks, in scope
    const university = await requireUniversity(player);
    if (await blockedEitherWay(invitation.from, player._id))
      throw AppError.notFound('Invitation not found.');
    if (invitation.kind === 'group') {
      const group = await CommunityGroup.findOne({
        _id: invitation.group,
        university: university._id,
      });
      if (!group) throw AppError.notFound('That group no longer exists.');
      await addMember(group, player._id);
    } else {
      // an invitation lets a friend in even when the event is friends-only
      const event = await CampusEvent.findOne({
        _id: invitation.event,
        university: university._id,
        cancelledAt: trusted({ $exists: false }),
      });
      if (!event) throw AppError.notFound('That event was cancelled.');
      if (
        (await blockedEitherWay(event.host, player._id)) ||
        !audienceIncludes(event.audience, await studentScopes(player._id))
      )
        throw AppError.forbidden('This event is only for some students.');
      const updated = await CampusEvent.findOneAndUpdate(
        {
          _id: event._id,
          attendees: trusted({ $ne: player._id }),
          $expr: trusted({ $lt: [{ $size: '$attendees' }, '$capacity'] }),
        },
        { $push: { attendees: player._id } },
      );
      if (!updated && !event.attendees.some((id) => String(id) === String(player._id))) {
        throw new AppError('This event is full.', 409, 'EVENT_FULL');
      }
    }
  }
  invitation.status = accept ? 'accepted' : 'declined';
  await invitation.save();
  return invitation;
}
