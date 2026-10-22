// Shared wardrobe vocabulary. Values (items, colours, presets) live in data, not here.

// what an item occupies on the body. "fullbody" (gowns, agbada, senator) replaces top + bottom;
// "overlay" sits over everything (e.g. a matriculation gown).
export const EQUIP_SLOTS = [
  'top',
  'bottom',
  'fullbody',
  'shoes',
  'headwear',
  'eyewear',
  'accessory',
  'overlay',
];
export const ITEM_SLOTS = ['hair', ...EQUIP_SLOTS];

// occasions players keep an outfit for
export const OCCASIONS = ['lecture', 'matriculation', 'party', 'formal', 'sports'];

export const BODY_TYPES = ['slim', 'average', 'sturdy'];
export const HEIGHT_RANGE = { min: 0.9, max: 1.1 };

export const HEX_COLOR = /^#[0-9a-f]{6}$/;
