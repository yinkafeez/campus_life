// Fixtures for the campus / social screens.
export const WARDROBE = {
  items: [
    {
      key: "hair-low-cut",
      name: "Low cut",
      slot: "hair",
      meshKey: "hair-low-cut",
      isStarter: true,
    },
    {
      key: "tshirt",
      name: "T-shirt",
      slot: "top",
      meshKey: "top-tshirt",
      colorable: true,
      isStarter: true,
    },
  ],
  owned: [{ itemKey: "hair-low-cut" }, { itemKey: "tshirt" }],
  palettes: {
    skinTones: [{ key: "tone-3", name: "Warm", hex: "#6b3f2a" }],
    hairColors: [{ key: "black", name: "Black", hex: "#151110" }],
    fabricColors: ["#0e9356"],
  },
  occasions: ["lecture", "party"],
  bodyTypes: ["average"],
  heightRange: { min: 0.9, max: 1.1 },
  starterLook: { top: { item: "tshirt" } },
};

export const CHARACTER = {
  _id: "c1",
  appearance: {
    bodyType: "average",
    height: 1,
    skinTone: "tone-3",
    hairColor: "black",
    hairStyle: "hair-low-cut",
  },
  equipped: { top: { item: "tshirt" } },
  outfits: [],
  lastPosition: null,
};

const look = { appearance: CHARACTER.appearance, equipped: CHARACTER.equipped };

export const CAMPUS_WORLD = {
  university: {
    slug: "unilag",
    name: "University of Lagos",
    shortName: "UNILAG",
  },
  world: {
    startZone: "unilag-senate-lagoon",
    zones: ["unilag-senate-lagoon", "arrival-plaza"],
  },
  locations: [
    {
      slug: "2001-cafeteria",
      name: "2001 Cafeteria",
      aliases: ["2001"],
      category: "food",
      description: "Popular spot for jollof and swallow.",
      parent: null,
      world: { zone: "unilag-senate-lagoon", x: 22, z: 18, radius: 7 },
      activities: [
        { key: "buy-jollof", label: "Buy jollof rice", kind: "eat" },
      ],
      verification: {
        status: "unverified",
        notes: "Opening hours not confirmed",
      },
      externalMapUrl:
        "https://www.google.com/maps/search/?api=1&query=2001%20Cafeteria",
      discovered: false,
    },
    {
      slug: "university-library",
      name: "University Library",
      aliases: [],
      category: "library",
      description: null,
      parent: null,
      world: { zone: "unilag-senate-lagoon", x: -22, z: 18, radius: 8 },
      activities: [{ key: "study", label: "Study", kind: "study" }],
      verification: { status: "verified", notes: null },
      externalMapUrl:
        "https://www.google.com/maps/search/?api=1&query=University%20Library",
      discovered: true,
    },
    {
      slug: "faculty-of-law",
      name: "Faculty of Law",
      aliases: [],
      category: "academic",
      world: null,
      activities: [],
      verification: { status: "verified" },
      externalMapUrl:
        "https://www.google.com/maps/search/?api=1&query=Faculty%20of%20Law",
      discovered: false,
    },
  ],
  npcs: [
    {
      key: "tobi-campus-guide",
      name: "Tobi",
      role: "Campus guide (fictional)",
      zone: "unilag-senate-lagoon",
      x: 3,
      z: 33,
      rotY: 0,
      look,
      dialogue: {
        start: {
          text: "Fresher! Welcome to Akoka.",
          options: [
            { label: "Any tips?", next: "tips" },
            { label: "Show me the way somewhere", action: "directions" },
            { label: "Bye", action: "end" },
          ],
        },
        tips: {
          text: "Carry your ID card everywhere.",
          options: [{ label: "Noted", action: "end" }],
        },
      },
    },
  ],
  discoveries: [],
};
