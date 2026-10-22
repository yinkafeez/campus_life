import mongoose from '../../core/db/mongoose.js';
import { universityRef } from '../../core/db/schemaTypes.js';

/*
 * COMMUNITY — player-made groups (study circles, fellowships, clubs), hangouts/events
 * at campus locations, and invitations between friends. All in-game and simulated.
 */
export const GROUP_KINDS = [
  'study',
  'faith',
  'sports',
  'culture',
  'hangout',
  'department',
  'other',
];
export const GROUP_VISIBILITY = ['public', 'invite'];
export const EVENT_KINDS = ['hangout', 'study', 'party', 'sports', 'worship', 'other'];
export const EVENT_VISIBILITY = ['public', 'friends', 'group'];
export const MAX_GROUP_MEMBERS = 200;

const groupMemberSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    joinedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const groupSchema = new mongoose.Schema(
  {
    university: universityRef(),
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 500 },
    kind: { type: String, enum: GROUP_KINDS, default: 'other' },
    visibility: { type: String, enum: GROUP_VISIBILITY, default: 'public' },
    owner: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true },
    members: {
      type: [groupMemberSchema],
      default: [],
      validate: [
        (val) => val.length <= MAX_GROUP_MEMBERS,
        `A group has at most ${MAX_GROUP_MEMBERS} members`,
      ],
    },
  },
  { timestamps: true },
);
groupSchema.index(
  { university: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
groupSchema.index({ 'members.player': 1 });

const eventSchema = new mongoose.Schema(
  {
    university: universityRef(),
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500 },
    kind: { type: String, enum: EVENT_KINDS, default: 'hangout' },
    host: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    group: { type: mongoose.Schema.ObjectId, ref: 'CommunityGroup' },
    // a campus location (slug) that exists in the game world
    locationSlug: { type: String, required: true, trim: true, maxlength: 80 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    visibility: { type: String, enum: EVENT_VISIBILITY, default: 'public' },
    capacity: { type: Number, min: 2, max: 500, default: 50 },
    attendees: { type: [{ type: mongoose.Schema.ObjectId, ref: 'Player' }], default: [] },
    cancelledAt: Date,
    // official events by elected leaders: shown with a badge, only to students in the leader's scope
    official: { positionCode: String, title: String, assignment: mongoose.Schema.ObjectId },
    audience: {
      type: { type: String, enum: ['university', 'faculty', 'department', 'hall'] },
      unit: mongoose.Schema.ObjectId,
    },
  },
  { timestamps: true },
);
eventSchema.index({ university: 1, startsAt: 1 });
eventSchema.index({ host: 1, startsAt: 1 });

const invitationSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    to: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    kind: { type: String, enum: ['group', 'event'], required: true, immutable: true },
    group: { type: mongoose.Schema.ObjectId, ref: 'CommunityGroup', immutable: true },
    event: { type: mongoose.Schema.ObjectId, ref: 'CampusEvent', immutable: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
  },
  { timestamps: true },
);
invitationSchema.index({ to: 1, status: 1, createdAt: -1 });
invitationSchema.index(
  { to: 1, group: 1, event: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_invite' },
);

export const CommunityGroup = mongoose.model('CommunityGroup', groupSchema);
export const CampusEvent = mongoose.model('CampusEvent', eventSchema);
export const Invitation = mongoose.model('Invitation', invitationSchema);
