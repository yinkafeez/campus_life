/*
 * UNILAG CAMPUS OVERVIEW — a stylised top-view model of the whole Akoka campus for the start
 * screen and the "your campus" map: the Main Gate (south-west), University Road up to Senate
 * House by the lagoon, the halls of residence, faculties, food spots and landmarks.
 *
 * POSITIONS ARE APPROXIMATE AND NOT TO SCALE — arranged from general knowledge of the campus so
 * a fresher gets a sense of where things are relative to each other. No map imagery or map data
 * was copied. To correct a place, move its x/z here (metres; +x east, +z south, the lagoon is
 * north-east). Slugs match the university's location records, so names come from the server
 * when available and from `label` otherwise.
 */
export default {
  key: "unilag",
  name: "University of Lagos (Akoka)",
  size: { width: 640, depth: 560 },
  ground: "#5f8f47",
  // the lagoon wraps the north and east of campus
  water: [
    { x: 320, z: -40, width: 160, depth: 700 },
    { x: 0, z: -330, width: 900, depth: 160 },
  ],
  // the Main Gate on University Road, facing along the road into campus (north-east)
  gate: { x: -225, z: 205, rotY: -0.92 },
  cabTerminal: { x: -192, z: 186, rotY: -Math.PI / 3 },

  roads: [
    // [x1, z1, x2, z2, width]
    [-300, 262, -225, 205, 24], // Akoka road → gate (dual carriageway)
    [-225, 205, -120, 110, 22], // University Road
    [-120, 110, -10, 20, 16],
    [-10, 20, 110, -40, 14], // → Senate House
    [110, -40, 210, -60, 10], // → Lagoon Front
    [-120, 110, -210, -40, 10], // to the halls (Moremi, Amina…)
    [-210, -40, -40, -170, 10], // ring road north
    [-40, -170, 110, -40, 10], // ring road → Senate
    [-10, 20, 40, 140, 10], // to the southern halls
    [40, 140, 200, 120, 10],
    [110, -40, 240, -200, 8], // → back gate
  ],

  // slug → place; category sets the building style. kind: "hall" draws a residence block.
  places: [
    // around the gate
    { slug: "main-gate", label: "Main Gate", x: -225, z: 205, kind: "marker" },
    {
      slug: "campus-bus-service",
      label: "Campus Bus Service",
      x: -160,
      z: 150,
      category: "transport",
    },
    {
      slug: "uba-park",
      label: "UBA Park",
      x: -125,
      z: 175,
      category: "transport",
    },
    {
      slug: "sports-centre",
      label: "Sports Centre",
      x: -175,
      z: 105,
      category: "sports",
      w: 46,
      d: 34,
      h: 6,
    },
    {
      slug: "medical-centre",
      label: "Medical Centre",
      x: -85,
      z: 160,
      category: "health",
    },
    // the academic core
    {
      slug: "student-union-building",
      label: "Student Union Building",
      x: -45,
      z: 0,
      category: "administrative",
    },
    {
      slug: "university-bookshop",
      label: "University Bookshop",
      x: 25,
      z: 5,
      category: "bookshop",
    },
    {
      slug: "amphitheatre",
      label: "Amphitheatre",
      x: 5,
      z: -45,
      category: "recreation",
    },
    {
      slug: "jf-ade-ajayi-auditorium",
      label: "J.F. Ade Ajayi Auditorium",
      x: 65,
      z: -15,
      category: "auditorium",
      w: 30,
      d: 36,
      h: 14,
    },
    {
      slug: "university-library",
      label: "University Library",
      x: 55,
      z: -95,
      category: "library",
      w: 34,
      d: 30,
      h: 16,
    },
    {
      slug: "senate-house",
      label: "Senate House",
      x: 125,
      z: -62,
      category: "administrative",
      w: 22,
      d: 18,
      h: 46,
    },
    {
      slug: "sofoluwe-park",
      label: "Sofoluwe Park",
      x: 160,
      z: -10,
      kind: "park",
    },
    {
      slug: "lagoon-front",
      label: "Lagoon Front",
      x: 225,
      z: -65,
      kind: "park",
    },
    {
      slug: "mad-house",
      label: "Mad House",
      x: 205,
      z: -130,
      category: "other",
    },
    {
      slug: "unilag-museum",
      label: "UNILAG Museum",
      x: 100,
      z: -135,
      category: "landmark",
    },
    {
      slug: "tayo-aderinokun-hall",
      label: "Tayo Aderinokun Hall",
      x: 160,
      z: -150,
      category: "auditorium",
    },
    {
      slug: "afe-babalola-auditorium",
      label: "Afe Babalola Auditorium",
      x: 185,
      z: 40,
      category: "auditorium",
      w: 30,
      d: 26,
      h: 12,
    },
    { slug: "love-garden", label: "Love Garden", x: 135, z: -25, kind: "park" },
    { slug: "cafe-one", label: "Cafe One", x: 85, z: -45, category: "food" },
    {
      slug: "unilag-chapel",
      label: "UNILAG Chapel",
      x: 100,
      z: 45,
      category: "religious",
    },
    {
      slug: "unilag-mosque",
      label: "UNILAG Mosque",
      x: 140,
      z: 70,
      category: "religious",
    },
    { slug: "back-gate", label: "Back Gate", x: 240, z: -200, kind: "marker" },
    // halls of residence and their food spots
    {
      slug: "new-hall-complex",
      label: "New Hall Complex",
      x: -45,
      z: -175,
      kind: "park",
    },
    {
      slug: "2001-cafeteria",
      label: "2001 Cafeteria",
      x: -10,
      z: -145,
      category: "food",
    },
    {
      slug: "queen-moremi-hall",
      label: "Queen Moremi Hall",
      x: -125,
      z: -55,
      kind: "hall",
    },
    {
      slug: "moremi-hall-garden",
      label: "Moremi Hall Garden",
      x: -100,
      z: -85,
      kind: "park",
    },
    {
      slug: "moremi-alumni-shopping-complex",
      label: "Moremi Alumni Shopping Complex",
      x: -80,
      z: -110,
      category: "market",
    },
    {
      slug: "moremi-cab-shuttle-park",
      label: "Moremi Cab Shuttle Park",
      x: -95,
      z: -25,
      category: "transport",
    },
    {
      slug: "queen-amina-hall",
      label: "Queen Amina Hall",
      x: -160,
      z: -25,
      kind: "hall",
    },
    {
      slug: "kofo-ademola-hall",
      label: "Madam Kofo Ademola Hall",
      x: -175,
      z: -80,
      kind: "hall",
    },
    {
      slug: "madam-tinubu-hall",
      label: "Madam Tinubu Hall",
      x: -145,
      z: -115,
      kind: "hall",
    },
    {
      slug: "ulws-hostel",
      label: "UNILAG Women Society Hostel",
      x: -205,
      z: -125,
      kind: "hall",
    },
    {
      slug: "red-bricks",
      label: "Red Bricks",
      x: -110,
      z: -150,
      category: "food",
    },
    { slug: "salado", label: "Salado", x: -60, z: -60, category: "food" },
    {
      slug: "fagunwa-hall",
      label: "Fagunwa Hall",
      x: -65,
      z: 45,
      kind: "hall",
    },
    {
      slug: "indomie-bridge",
      label: "Indomie Bridge",
      x: -140,
      z: 45,
      category: "landmark",
    },
    {
      slug: "king-jaja-hall",
      label: "King Jaja Hall",
      x: -20,
      z: 75,
      kind: "hall",
    },
    { slug: "mariere-hall", label: "Mariere Hall", x: 25, z: 60, kind: "hall" },
    {
      slug: "eni-njoku-hall",
      label: "Eni-Njoku Hall",
      x: 60,
      z: 90,
      kind: "hall",
    },
    {
      slug: "saburi-biobaku-hall",
      label: "Saburi Biobaku Hall",
      x: -95,
      z: 100,
      kind: "hall",
    },
    { slug: "shop-10", label: "Shop 10", x: -55, z: 115, category: "food" },
    { slug: "iya-moria", label: "Iya Moria", x: 5, z: 135, category: "food" },
    { slug: "mavise", label: "Mavise", x: 45, z: 150, category: "food" },
    {
      slug: "sodeinde-hall",
      label: "Sodeinde Hall",
      x: -15,
      z: -205,
      kind: "hall",
    },
    {
      slug: "el-kanemi-hall",
      label: "El-Kanemi Hall",
      x: 25,
      z: -195,
      kind: "hall",
    },
    {
      slug: "makama-bida-hall",
      label: "Makama Bida Hall",
      x: 65,
      z: -185,
      kind: "hall",
    },
    {
      slug: "honours-hall",
      label: "Honours Hall",
      x: 105,
      z: 125,
      kind: "hall",
    },
    {
      slug: "femi-gbajabiamila-hall",
      label: "Femi Gbajabiamila Hall",
      x: 145,
      z: 110,
      kind: "hall",
    },
    {
      slug: "henry-carr-hall",
      label: "Henry Carr Hall",
      x: 185,
      z: 140,
      kind: "hall",
    },
    {
      slug: "erastus-akingbola-hall",
      label: "Erastus Akingbola Hall",
      x: 225,
      z: 110,
      kind: "hall",
    },
  ],

  // unnamed faculty / office blocks that fill out the campus (generic, no names claimed)
  fillers: { seed: 11, count: 46 },
  trees: { seed: 5, count: 520 },
};
