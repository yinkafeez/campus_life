import mongoose from '../../core/db/mongoose.js';

/*
 * Wardrobe settings — palettes, the starter look and default outfits. One document per scope:
 *   key "global"   — used by everyone
 *   key "<slug>"   — reserved for university-specific overrides (later)
 * Validated with zod on import (wardrobe.schema.js); stored as plain data.
 */
const wardrobeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    palettes: { type: mongoose.Schema.Types.Mixed, required: true },
    starterLook: { type: mongoose.Schema.Types.Mixed, required: true },
    defaultOutfits: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

const WardrobeSettings = mongoose.model('WardrobeSettings', wardrobeSettingsSchema);

export default WardrobeSettings;
