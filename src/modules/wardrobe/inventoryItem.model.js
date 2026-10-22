import mongoose from '../../core/db/mongoose.js';

export const ITEM_SOURCES = ['starter', 'reward', 'purchase', 'admin', 'gift', 'prize'];

// an item a player owns. Wardrobe items are owned once (quantity 1) and can be equipped;
// economy items (food, stationery, tools) stack in `quantity`.
const inventoryItemSchema = new mongoose.Schema(
  {
    player: { type: mongoose.Schema.ObjectId, ref: 'Player', required: true, immutable: true },
    itemKey: { type: String, required: true, trim: true, immutable: true },
    quantity: { type: Number, default: 1, min: 0 },
    source: { type: String, enum: ITEM_SOURCES, default: 'starter' },
    acquiredAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// one row per player and item
inventoryItemSchema.index({ player: 1, itemKey: 1 }, { unique: true });

const InventoryItem = mongoose.model('InventoryItem', inventoryItemSchema);

export default InventoryItem;
