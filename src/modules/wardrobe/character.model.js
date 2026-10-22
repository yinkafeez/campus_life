import mongoose from '../../core/db/mongoose.js';
import {
  BODY_TYPES,
  EQUIP_SLOTS,
  HEIGHT_RANGE,
  HEX_COLOR,
  OCCASIONS,
} from './wardrobe.constants.js';

/*
 * A player's 3D character: body appearance, what they're wearing, their saved outfits and
 * where they last stood. Item keys are checked against the catalogue + inventory by the
 * wardrobe service (it needs the database); the schema checks shape and ranges.
 */
const wornItemSchema = new mongoose.Schema(
  {
    item: { type: String, required: true, trim: true, maxlength: 80 },
    color: { type: String, lowercase: true, match: [HEX_COLOR, 'A colour must look like #a1b2c3'] },
  },
  { _id: false },
);

// one optional worn item per equip slot
const slotsSchema = new mongoose.Schema(
  Object.fromEntries(
    EQUIP_SLOTS.map((slot) => [slot, { type: wornItemSchema, default: undefined }]),
  ),
  { _id: false },
);

const outfitSchema = new mongoose.Schema(
  {
    occasion: { type: String, required: true, enum: OCCASIONS },
    slots: { type: slotsSchema, default: () => ({}) },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const characterSchema = new mongoose.Schema(
  {
    player: {
      type: mongoose.Schema.ObjectId,
      ref: 'Player',
      required: true,
      unique: true,
      immutable: true,
    },
    appearance: {
      bodyType: { type: String, enum: BODY_TYPES, default: 'average' },
      height: { type: Number, min: HEIGHT_RANGE.min, max: HEIGHT_RANGE.max, default: 1 },
      // palette keys (validated against WardrobeSettings by the service)
      skinTone: { type: String, required: true, trim: true, maxlength: 40 },
      hairColor: { type: String, required: true, trim: true, maxlength: 40 },
      // an item key with slot "hair"
      hairStyle: { type: String, required: true, trim: true, maxlength: 80 },
    },
    equipped: { type: slotsSchema, default: () => ({}) },
    outfits: {
      type: [outfitSchema],
      default: [],
      validate: [
        (val) => new Set(val.map((el) => el.occasion)).size === val.length,
        'One outfit per occasion',
      ],
    },
    // where the player last stood in the world (resume point)
    lastPosition: {
      zone: { type: String, trim: true, maxlength: 60 },
      x: Number,
      z: Number,
      rotY: Number,
      savedAt: Date,
    },
  },
  { timestamps: true, minimize: false },
);

const Character = mongoose.model('Character', characterSchema);

export default Character;
