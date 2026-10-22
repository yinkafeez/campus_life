import mongoose from '../../core/db/mongoose.js';
import {
  aliasesField,
  nameField,
  slugField,
  SLUG_PATTERN,
  universityRef,
} from '../../core/db/schemaTypes.js';
import { verificationField } from '../../core/db/verification.js';
import sameUniversity from '../../core/db/plugins/sameUniversity.js';

export const LOCATION_CATEGORIES = [
  'academic',
  'administrative',
  'auditorium',
  'library',
  'hostel',
  'food',
  'market',
  'shop',
  'bookshop',
  'printing',
  'recreation',
  'park',
  'sports',
  'transport',
  'health',
  'religious',
  'landmark',
  'gate',
  'other',
];

const coordinatesSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);

export const ACTIVITY_KINDS = [
  'eat',
  'study',
  'rest',
  'hangout',
  'explore',
  'worship',
  'exercise',
  'shop',
];

const worldPlacementSchema = new mongoose.Schema(
  {
    zone: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [SLUG_PATTERN, 'A zone key may only contain a-z, 0-9 and single dashes'],
    },
    x: { type: Number, required: true, min: -1000, max: 1000 },
    z: { type: Number, required: true, min: -1000, max: 1000 },
    // how close (metres) a player must be to discover / interact
    radius: { type: Number, default: 4, min: 1, max: 30 },
  },
  { _id: false },
);

const activitySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, match: SLUG_PATTERN, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, required: true, enum: ACTIVITY_KINDS },
    // what the game says when the player does it
    message: { type: String, trim: true, maxlength: 280 },
  },
  { _id: false },
);

// a place on campus: a building, a cafeteria inside it, a park, a bus stop...
const campusLocationSchema = new mongoose.Schema(
  {
    university: universityRef(),
    slug: slugField('location'),
    name: nameField('location'),
    aliases: aliasesField(),
    category: {
      type: String,
      required: [true, 'A location must have a category'],
      enum: { values: LOCATION_CATEGORIES, message: 'Unknown location category: {VALUE}' },
    },
    description: { type: String, trim: true, maxlength: 600 },
    // the location this one sits inside or belongs to (e.g. a cafeteria inside the SUB)
    parent: { type: mongoose.Schema.ObjectId, ref: 'CampusLocation' },
    // world-streaming zone the 3D client loads it with (zones arrive with the world phase)
    zone: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 60,
      match: [SLUG_PATTERN, 'A zone key may only contain a-z, 0-9 and single dashes'],
    },
    // real-world reference point (approximate) — not game coordinates
    coordinates: coordinatesSchema,
    // where the location sits in a playable 3D zone (game layout — stylised, not to scale)
    world: { type: worldPlacementSchema, default: undefined },
    // things a player can do there (contextual interaction menu)
    activities: { type: [activitySchema], default: [] },
    // text for the optional "open in Google Maps" reference link (defaults to name + university)
    mapQuery: { type: String, trim: true, maxlength: 160 },
    verification: verificationField(),
  },
  { timestamps: true },
);

campusLocationSchema.index({ university: 1, slug: 1 }, { unique: true });
campusLocationSchema.index({ university: 1, category: 1 });
campusLocationSchema.index({ parent: 1 });

campusLocationSchema.path('parent').validate(function (val) {
  return !val || !this._id || String(val) !== String(this._id);
}, 'A location cannot be its own parent');

campusLocationSchema.plugin(sameUniversity, {
  path: 'parent',
  model: 'CampusLocation',
  label: 'parent location',
});

const CampusLocation = mongoose.model('CampusLocation', campusLocationSchema);

export default CampusLocation;
