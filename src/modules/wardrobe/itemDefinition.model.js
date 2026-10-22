import mongoose from '../../core/db/mongoose.js';
import { nameField, slugField } from '../../core/db/schemaTypes.js';
import { HEX_COLOR, ITEM_SLOTS, OCCASIONS } from './wardrobe.constants.js';

// a cosmetic item in the catalogue (a hairstyle, a shirt, a gele...). Players OWN items through
// InventoryItem; the 3D client draws an item from its meshKey.
const itemDefinitionSchema = new mongoose.Schema(
  {
    key: { ...slugField('item'), unique: true, immutable: true },
    name: nameField('item', 80),
    slot: {
      type: String,
      required: [true, 'An item must have a slot'],
      enum: { values: ITEM_SLOTS, message: 'Unknown item slot: {VALUE}' },
    },
    // which renderer the 3D client uses ("top-tshirt", "hair-afro"...)
    meshKey: slugField('mesh key'),
    // occasions the item suits (used for outfit suggestions)
    occasions: {
      type: [{ type: String, enum: OCCASIONS }],
      default: [],
    },
    colorable: { type: Boolean, default: true },
    defaultColor: {
      type: String,
      lowercase: true,
      match: [HEX_COLOR, 'A colour must look like #a1b2c3'],
      default: '#3b4f44',
    },
    // every new character receives starter items
    isStarter: { type: Boolean, default: false },
    // null = available at every university; set = only for that university's students
    university: { type: mongoose.Schema.ObjectId, ref: 'University', default: null },
    // price in kobo for the future shop (0 = free)
    price: { type: Number, default: 0, min: 0 },
    description: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

itemDefinitionSchema.index({ slot: 1 });
itemDefinitionSchema.index({ university: 1 });

const ItemDefinition = mongoose.model('ItemDefinition', itemDefinitionSchema);

export default ItemDefinition;
