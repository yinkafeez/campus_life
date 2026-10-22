// How each clothing meshKey dresses the body.
// "covers" lists body segments painted in the item's colour; extra pieces (skirts, hats,
// glasses...) are drawn by CharacterModel from the "extra" name. Adding an item = adding a
// meshKey here (plus an extra renderer if it needs a new shape).

export const BODY_SEGMENTS = [
  "torso",
  "hips",
  "upperArm",
  "lowerArm",
  "upperLeg",
  "lowerLeg",
  "feet",
];

const SHORT_SLEEVE = ["torso", "upperArm"];
const LONG_SLEEVE = ["torso", "upperArm", "lowerArm"];
const TROUSERS = ["hips", "upperLeg", "lowerLeg"];

export const MESH_PARTS = {
  // tops
  "top-tshirt": { covers: SHORT_SLEEVE },
  "top-polo": { covers: SHORT_SLEEVE, extra: "collar" },
  "top-jersey": { covers: SHORT_SLEEVE, extra: "jersey-stripe" },
  "top-blouse": { covers: SHORT_SLEEVE, extra: "collar" },
  "top-shirt": { covers: LONG_SLEEVE, extra: "collar" },
  "top-hoodie": { covers: LONG_SLEEVE, extra: "hood" },
  "top-ankara": { covers: LONG_SLEEVE, extra: "ankara-pattern" },

  // bottoms
  "bottom-trousers": { covers: TROUSERS },
  "bottom-joggers": { covers: TROUSERS, extra: "cuffs" },
  "bottom-shorts": { covers: ["hips", "upperLeg"] },
  "bottom-skirt": { covers: ["hips"], extra: "skirt" },

  // full body (replaces top + bottom)
  "fullbody-senator": {
    covers: [...LONG_SLEEVE, ...TROUSERS],
    extra: "long-top",
  },
  "fullbody-gown": { covers: [...SHORT_SLEEVE, "hips"], extra: "gown" },
  "fullbody-agbada": { covers: [...LONG_SLEEVE, ...TROUSERS], extra: "agbada" },
  "fullbody-wrapper": { covers: [...SHORT_SLEEVE, "hips"], extra: "wrapper" },

  // shoes
  "shoes-sneakers": { covers: ["feet"], extra: "sole-white" },
  "shoes-formal": { covers: ["feet"] },
  "shoes-sandals": { covers: [], extra: "sandals" },

  // head, face, extras
  "headwear-cap": { covers: [], extra: "cap" },
  "headwear-headband": { covers: [], extra: "headband" },
  "headwear-gele": { covers: [], extra: "gele" },
  "headwear-fila": { covers: [], extra: "fila" },
  "eyewear-glasses": { covers: [], extra: "glasses" },
  "eyewear-sunglasses": { covers: [], extra: "sunglasses" },
  "accessory-backpack": { covers: [], extra: "backpack" },
  "accessory-watch": { covers: [], extra: "watch" },
  "overlay-gown": { covers: [], extra: "academic-gown" },
};

// slots in paint order: later slots win (a full-body item over nothing, overlay on top)
const PAINT_ORDER = ["bottom", "top", "fullbody", "shoes"];

/**
 * Work out what colour each body segment is and which extra pieces to draw.
 * worn: { slot: { item, color } }, itemsByKey: catalogue map.
 */
export function dressBody(worn, itemsByKey, { skin, underwear = "#2b2b2e" }) {
  const segments = Object.fromEntries(BODY_SEGMENTS.map((seg) => [seg, skin]));
  segments.hips = underwear;
  const extras = [];

  const colourOf = (slot) => {
    const piece = worn?.[slot];
    if (!piece) return null;
    const item = itemsByKey.get(piece.item);
    if (!item) return null;
    return { item, color: piece.color ?? item.defaultColor };
  };

  PAINT_ORDER.forEach((slot) => {
    const dressed = colourOf(slot);
    if (!dressed) return;
    const parts = MESH_PARTS[dressed.item.meshKey];
    if (!parts) return;
    parts.covers.forEach((seg) => {
      segments[seg] = dressed.color;
    });
    if (parts.extra)
      extras.push({ extra: parts.extra, color: dressed.color, slot });
  });

  ["headwear", "eyewear", "accessory", "overlay"].forEach((slot) => {
    const dressed = colourOf(slot);
    const parts = dressed && MESH_PARTS[dressed.item.meshKey];
    if (parts?.extra)
      extras.push({ extra: parts.extra, color: dressed.color, slot });
  });

  return { segments, extras };
}
