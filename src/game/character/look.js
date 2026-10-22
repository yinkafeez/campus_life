// Helpers for editing a look in the creator (the server re-validates everything).

export const OPTIONAL_SLOTS = [
  "fullbody",
  "headwear",
  "eyewear",
  "accessory",
  "overlay",
];

/** Put an item in a slot (or clear it with null), keeping full-body vs top/bottom exclusive. */
export function setSlot(equipped, slot, worn) {
  const next = { ...equipped };
  if (worn) next[slot] = worn;
  else delete next[slot];

  if (worn && slot === "fullbody") {
    delete next.top;
    delete next.bottom;
  }
  if (worn && (slot === "top" || slot === "bottom")) delete next.fullbody;
  return next;
}

/** A first look for a new player: the wardrobe's starter outfit + neutral appearance. */
export function defaultLook(catalogue) {
  const firstHair = catalogue.items.find(
    (el) => el.slot === "hair" && el.isStarter,
  );
  return {
    appearance: {
      bodyType: "average",
      height: 1,
      skinTone:
        catalogue.palettes.skinTones[
          Math.floor(catalogue.palettes.skinTones.length / 2)
        ].key,
      hairColor: catalogue.palettes.hairColors[0].key,
      hairStyle: firstHair?.key ?? "hair-bald",
    },
    equipped: { ...catalogue.starterLook },
  };
}

/** Just the data the API accepts (drops ids/timestamps the server adds). */
export function cleanSlots(slots = {}) {
  return Object.fromEntries(
    Object.entries(slots)
      .filter(([, worn]) => worn?.item)
      .map(([slot, worn]) => [
        slot,
        worn.color
          ? { item: worn.item, color: worn.color }
          : { item: worn.item },
      ]),
  );
}
