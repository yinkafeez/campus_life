import mongoose from '../../core/db/mongoose.js';
import { aliasesField, nameField, slugField, universityRef } from '../../core/db/schemaTypes.js';
import { verificationField } from '../../core/db/verification.js';
import sameUniversity from '../../core/db/plugins/sameUniversity.js';
import { PRIORITY_GROUPS } from '../universities/university.config.js';

export const RESIDENT_GENDERS = ['male', 'female', 'mixed'];
export const RESIDENT_TYPES = ['undergraduate', 'postgraduate', 'any'];
export const ALLOCATION_MODES = ['ballot', 'direct'];

// who a hostel takes — university-wide rules live in University.config.accommodation
const allocationSchema = new mongoose.Schema(
  {
    // levels allowed to live here (empty = any level the university has)
    eligibleLevels: { type: [Number], default: [] },
    // groups that get bed spaces here first
    reservedFor: {
      type: [{ type: String, enum: PRIORITY_GROUPS }],
      default: [],
    },
    // ballot = allocated in the accommodation exercise; direct = book a bed straight away
    mode: { type: String, enum: ALLOCATION_MODES, default: 'ballot' },
  },
  { _id: false },
);

// a hall of residence
const hostelSchema = new mongoose.Schema(
  {
    university: universityRef(),
    slug: slugField('hostel'),
    name: nameField('hostel'),
    aliases: aliasesField(),
    residentGender: {
      type: String,
      required: [true, 'A hostel must say who it houses (male, female or mixed)'],
      enum: {
        values: RESIDENT_GENDERS,
        message: 'Resident gender is either: male, female or mixed',
      },
    },
    residentType: {
      type: String,
      enum: {
        values: RESIDENT_TYPES,
        message: 'Resident type is either: undergraduate, postgraduate or any',
      },
      default: 'undergraduate',
    },
    capacity: {
      type: Number,
      min: [1, 'Capacity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Capacity must be a whole number' },
    },
    // where it is on the campus map
    location: { type: mongoose.Schema.ObjectId, ref: 'CampusLocation' },
    allocation: { type: allocationSchema, default: () => ({}) },
    // game room layout: rooms x beds per room (real room plans aren't published)
    roomPlan: {
      rooms: { type: Number, min: 1, max: 2000 },
      bedsPerRoom: { type: Number, min: 1, max: 12 },
    },
    // visiting hours, curfews, porters' lodge rules... as the university states them
    accessRules: { type: String, trim: true, maxlength: 1000 },
    verification: verificationField(),
  },
  { timestamps: true },
);

hostelSchema.index({ university: 1, slug: 1 }, { unique: true });
hostelSchema.index({ university: 1, residentGender: 1 });

hostelSchema.plugin(sameUniversity, { path: 'location', model: 'CampusLocation' });

const Hostel = mongoose.model('Hostel', hostelSchema);

export default Hostel;
