import { buildTown, CELL_W, CELL_H, X, Y, ROAD_HALF_WIDTH } from "./layout.js";
import { pierDepth, buildRingPiers } from "./viaduct.js";

export { CELL_W, CELL_H, X, Y };
export const TAU = 2 * Math.PI;

const COLS = 16,
  ROWS = 12;
const CANAL_ROW = 6,
  RIVER_ROW = 7,
  RIVER_SOUTH_ROW = 8;

// 10 road bridges across la Ferre (most, not all, columns; open water at 0, 2, 5, 7, 9, 15).
const BRIDGE_COLS = [1, 3, 4, 6, 8, 10, 11, 12, 13, 14];
const BRIDGE_SET = new Set(BRIDGE_COLS);

// Roundabouts: star roundabout around Arc des Saisies, obelisk square, NE boulevard, SE Rive Gauche.
const ROUNDABOUTS = new Map([
  ["c3r3", { radius: 22, outerRadius: 54 }], // Étoile des Saisies (Arc des Saisies)
  ["c6r5", { radius: 18, outerRadius: 46 }], // Place de la Contrainte (Obelisk)
  ["c13r2", { radius: 15, outerRadius: 42 }], // Rond-Point du Timbre
  ["c10r10", { radius: 15, outerRadius: 42 }], // Place de la Rive-Sud
]);

// Helper to build a regular octagon footprint around (cx, cy).
function octagon(cx, cy, rx, ry = rx) {
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i * TAU) / 8 + Math.PI / 8;
    return [+(cx + Math.cos(a) * rx).toFixed(1), +(cy + Math.sin(a) * ry).toFixed(1)];
  });
}
function boxPoly(left, top, right, bottom) {
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

// 16x12 registered street painting keys.
// Note: "market" contains a painted elevated railway across its roofline, so it appears ONLY on
// the horizontal Petite Ceinture ring viaduct rows (row 1 and row 11, cols 2..13).
const blocks = [
  // 0    1         2         3         4         5         6         7         8         9         10        11        12        13        14        15
  ["square", "garage", "square", "square", "garage", "square", "square", "square", "square", "square", "garage", "square", "square", "garage", "square", "docks"], // r00 Butte du Créancier
  ["square", "garage", "market", "square", "market", "garage", "square", "market", "square", "market", "garage", "market", "square", "market", "garage", "square"], // r01 Petite Ceinture North
  ["garage", "square", "square", "square", "square", "garage", "square", "square", "square", "square", "square", "garage", "square", "square", "square", "garage"], // r02 Grands Boulevards North
  ["square", "garage", "square", "square", "square", "square", "square", "square", "garage", "square", "garage", "square", "garage", "square", "square", "garage"], // r03 Arc / Opéra / Parc NE
  ["garage", "square", "square", "garage", "square", "garage", "square", "square", "square", "garage", "square", "garage", "square", "square", "square", "docks"], // r04 Bourse / Vieux Marais
  ["square", "garage", "square", "square", "garage", "square", "square", "garage", "square", "garage", "square", "garage", "square", "square", "garage", "docks"], // r05 Contrainte / Étude / Marais
  ["docks", "square", "garage", "square", "square", "square", "square", "square", "square", "square", "square", "square", "square", "garage", "docks", "docks"], // r06 Quai Nord
  ["docks", "docks", "docks", "docks", "docks", "docks", "docks", "docks", "square", "square", "square", "docks", "docks", "docks", "docks", "docks"], // r07 la Ferre + Île (cols 8..10)
  ["docks", "garage", "square", "square", "square", "square", "square", "square", "square", "square", "square", "square", "garage", "docks", "docks", "docks"], // r08 Quai Sud / Tour de Fer
  ["docks", "garage", "square", "square", "square", "garage", "square", "square", "square", "garage", "square", "garage", "square", "docks", "garage", "docks"], // r09 Champ-de-Fer / Sénat / Latin
  ["garage", "square", "square", "square", "square", "square", "square", "square", "square", "square", "square", "square", "garage", "docks", "square", "docks"], // r10 Boulevard Rive Gauche
  ["docks", "garage", "market", "square", "market", "garage", "market", "square", "market", "garage", "square", "market", "docks", "market", "garage", "docks"], // r11 Petite Ceinture South
];

// Semantic cell kinds matching art-src/scenery/manifest.json keys for drop-in painting integration.
const cellKinds = blocks.map((row, r) =>
  row.map((key, c) => {
    if (r === RIVER_ROW) {
      if (c === 8) return "palaisJustice";
      if (c === 9) return "islandWest";
      if (c === 10) return "islandCathedral";
      return BRIDGE_SET.has(c) ? "riverBridge" : "river";
    }
    if (c === 3 && r === 3) return "starArch";
    if (c === 6 && r === 5) return "obeliskSquare";
    if (ROUNDABOUTS.has(`c${c}r${r}`)) return "boulevard";
    if (c === 3 && r === 8) return "towerBase";
    if (c === 7 && r === 3) return "opera";
    if (c === 8 && r === 0) return "basilica";
    if ((c === 3 || c === 4) && r === 9) return "park";
    if (c === 14 && (r === 3 || r === 4)) return "park";
    if (c === 7 && r === 9) return "park";
    if (c >= 10 && c <= 11 && r === 4) return "alleyCross";
    if (c >= 9 && c <= 12 && r >= 3 && r <= 5) return "haussmannCafe";
    if (r === 1) return "ringNorth";
    if (r === 11) return "ringSouth";
    if (r === 6 || r === 8) return "boulevard";
    if (r === 2 || r === 10 || c === 2 || c === 13) return "boulevard";
    if (key === "square") return (c + r) % 3 === 0 ? "haussmannCafe" : "haussmann";
    return key;
  }),
);

// Build the full Paris-like road graph: avenues, streets, alleys, opened seam passages, tees, dead ends & roundabouts.
function buildParisRoads() {
  const nodes = [];
  const nodeIds = new Set();
  const addNode = (col, row, extra = {}) => {
    const id = `c${col}r${row}`;
    const rb = ROUNDABOUTS.get(id);
    const node = {
      id,
      col,
      row,
      x: X(col),
      y: Y(row),
      kind: rb ? "roundabout" : "cross",
      ...(rb ? { radius: rb.radius, outerRadius: rb.outerRadius } : {}),
      ...extra,
    };
    nodes.push(node);
    nodeIds.add(id);
    return node;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === RIVER_ROW && (c < 8 || c > 10)) continue; // open river water
      addNode(c, r);
    }
  }

  // Omitted edges create genuine dead-end impasses, park sanctuaries, and varied T-junctions.
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const omitted = new Set([
    // Impasse de l'Ouest at (1, 4): connects only east to (2, 4).
    edgeKey("c0r4", "c1r4"),
    edgeKey("c1r3", "c1r4"),
    edgeKey("c1r4", "c1r5"),
    // Impasse du Parchemin at (12, 4) inside Marais: alley dead end off (11, 4).
    edgeKey("c12r3", "c12r4"),
    edgeKey("c12r4", "c12r5"),
    edgeKey("c12r4", "c13r4"),
    // Allée du Champ-de-Fer at (4, 9) inside SW park: dead end off (4, 8).
    edgeKey("c3r9", "c4r9"),
    edgeKey("c4r9", "c5r9"),
    edgeKey("c4r9", "c4r10"),
    // Impasse des Buttes at (14, 3) inside Parc des Buttes-Fiscales: dead end off (13, 3).
    edgeKey("c14r2", "c14r3"),
    edgeKey("c14r3", "c14r4"),
    edgeKey("c14r3", "c15r3"),
    // Cour du Sénat at (7, 9) inside Jardin du Sénat: dead end off (7, 8).
    edgeKey("c6r9", "c7r9"),
    edgeKey("c7r9", "c8r9"),
    edgeKey("c7r9", "c7r10"),
    // Additional T-junctions for natural Parisian street rhythm.
    edgeKey("c5r1", "c5r2"),
    edgeKey("c12r9", "c12r10"),
    // Island centre square (9, 7) has no N/S bridges (bridges are at col 8 and col 10).
    edgeKey("c9r6", "c9r7"),
    edgeKey("c9r7", "c9r8"),
  ]);

  // Narrow alley edges (halfWidth = 7, admitting walkers and vehicles with halfWidth <= 3.6).
  const alleyEdges = new Set([
    // Le Vieux Marais (centre-east dense old quarter).
    edgeKey("c10r3", "c10r4"),
    edgeKey("c10r4", "c10r5"),
    edgeKey("c11r3", "c11r4"),
    edgeKey("c11r4", "c11r5"),
    edgeKey("c9r4", "c10r4"),
    edgeKey("c10r4", "c11r4"),
    edgeKey("c11r4", "c12r4"),
    edgeKey("c10r3", "c11r3"),
    edgeKey("c10r5", "c11r5"),
    // Quartier Latin (Rive Gauche old quarter).
    edgeKey("c9r8", "c9r9"),
    edgeKey("c9r9", "c10r9"),
    // Montmartre / Butte du Créancier narrow lanes flanking Sacré-Créancier.
    edgeKey("c7r0", "c8r0"),
    edgeKey("c8r0", "c9r0"),
  ]);

  function edgeClass(c1, r1, c2, r2) {
    const k = edgeKey(`c${c1}r${r1}`, `c${c2}r${r2}`);
    if (alleyEdges.has(k)) return "alley";
    // Horizontal avenues: Grand Boulevards (r2, r10), Quays (r6, r8), Arc–Opéra axis (r3), Obelisk–Étude axis (r5).
    if (r1 === r2) {
      if (r1 === 6 || r1 === 8) return "avenue";
      if ((r1 === 2 || r1 === 10) && Math.min(c1, c2) >= 2 && Math.max(c1, c2) <= 13) return "avenue";
      if (r1 === 3 && Math.min(c1, c2) >= 1 && Math.max(c1, c2) <= 8) return "avenue";
      if (r1 === 5 && Math.min(c1, c2) >= 3 && Math.max(c1, c2) <= 8) return "avenue";
      return "street";
    }
    // Vertical avenues: Grand Boulevards (c2, c13), Grand Axes (c3 Tour-Arc, c6 Obelisk, c8 Palais-Basilica, c10 Cathedral).
    if (c1 === c2) {
      if ((c1 === 2 || c1 === 13) && Math.min(r1, r2) >= 2 && Math.max(r1, r2) <= 10) return "avenue";
      if (c1 === 3 && Math.min(r1, r2) >= 1 && Math.max(r1, r2) <= 11) return "avenue";
      if (c1 === 6 && Math.min(r1, r2) >= 1 && Math.max(r1, r2) <= 10) return "avenue";
      if (c1 === 8) return "avenue";
      if (c1 === 10 && Math.min(r1, r2) >= 2 && Math.max(r1, r2) <= 10) return "avenue";
      return "street";
    }
    return "street";
  }

  const edges = [];
  const pushEdge = (a, b, cls, extra = {}) => {
    if (omitted.has(edgeKey(a, b))) return;
    edges.push({ a, b, class: cls, halfWidth: ROAD_HALF_WIDTH[cls], ...extra });
  };

  // Horizontal edges.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = `c${c}r${r}`,
        b = `c${c + 1}r${r}`;
      if (!nodeIds.has(a) || !nodeIds.has(b)) continue;
      pushEdge(a, b, edgeClass(c, r, c + 1, r));
    }
  }

  // Vertical edges + River Bridges.
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 1; r++) {
      if (r === CANAL_ROW) {
        if (!BRIDGE_SET.has(c)) continue;
        if (c >= 8 && c <= 10) {
          // Island bridge north arm (c,6) -> (c,7)
          pushEdge(`c${c}r6`, `c${c}r7`, edgeClass(c, 6, c, 7), { bridge: true });
        } else {
          // Direct river bridge (c,6) -> (c,8)
          pushEdge(`c${c}r6`, `c${c}r8`, edgeClass(c, 6, c, 8), { bridge: true });
        }
        continue;
      }
      if (r === RIVER_ROW) {
        if (c >= 8 && c <= 10 && BRIDGE_SET.has(c)) {
          // Island bridge south arm (c,7) -> (c,8)
          pushEdge(`c${c}r7`, `c${c}r8`, edgeClass(c, 7, c, 8), { bridge: true });
        }
        continue;
      }
      const a = `c${c}r${r}`,
        b = `c${c}r${r + 1}`;
      if (!nodeIds.has(a) || !nodeIds.has(b)) continue;
      pushEdge(a, b, edgeClass(c, r, c, r + 1));
    }
  }

  // Opened seam service lanes promoted into explicit usable alley passages!
  // Each seam alley splits its north & south horizontal edges at the mid-cell seam node (col + 0.5).
  const seamAlleys = [
    { col: 9.5, rowA: 4, rowB: 5 }, // Passage des Greffes (right next to Le Boum / Marais)
    { col: 10.5, rowA: 3, rowB: 4 }, // Passage du Sceau (Marais heart)
    { col: 6.5, rowA: 0, rowB: 1 }, // Passage de la Butte (Montmartre steps shortcut, clear of market west pier)
    { col: 9.5, rowA: 8, rowB: 9 }, // Passage des Écoles (Quartier Latin)
  ];

  function splitHorizontalEdge(cLeft, row, midCol) {
    const a = `c${cLeft}r${row}`,
      b = `c${cLeft + 1}r${row}`;
    const midId = `c${midCol}r${row}`;
    if (!nodeIds.has(midId)) {
      nodes.push({ id: midId, col: midCol, row, x: X(midCol), y: Y(row), kind: "tee" });
      nodeIds.add(midId);
    }
    const idx = edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    if (idx >= 0) {
      const orig = edges[idx];
      edges.splice(
        idx,
        1,
        { a, b: midId, class: orig.class, halfWidth: orig.halfWidth },
        { a: midId, b, class: orig.class, halfWidth: orig.halfWidth },
      );
    }
    return midId;
  }

  for (const s of seamAlleys) {
    const cLeft = Math.floor(s.col);
    const topId = splitHorizontalEdge(cLeft, s.rowA, s.col);
    const botId = splitHorizontalEdge(cLeft, s.rowB, s.col);
    edges.push({ a: topId, b: botId, class: "alley", halfWidth: ROAD_HALF_WIDTH.alley, seam: true });
  }

  return { nodes, edges };
}

// River la Ferre: open water between North Quay (row 6) and South Quay (row 8), with Île de la Ferre at cols 8..10.
const riverTop = Y(CANAL_ROW) + 42; // 1482
const riverBottom = Y(RIVER_SOUTH_ROW) - 42; // 1854
const island = {
  left: X(8) - 108, // 2287
  right: X(10) + 108, // 3083
  top: Y(RIVER_ROW) - 78, // 1590
  bottom: Y(RIVER_ROW) + 78, // 1746
};

const river = {
  riverRow: RIVER_ROW,
  southRow: RIVER_SOUTH_ROW,
  top: riverTop,
  bottom: riverBottom,
  islands: [island],
  bridges: BRIDGE_COLS.map((col) => ({ col, x: X(col), halfWidth: 22, clearance: true })),
  // Smooth west-to-east navigation centreline curving through the wide 108-unit south channel around Île de la Ferre.
  centreline: [
    { x: 0, y: Y(RIVER_ROW) },
    { x: 1960, y: Y(RIVER_ROW) },
    { x: 2150, y: 1756 },
    { x: 2300, y: 1800 },
    { x: 2685, y: 1800 },
    { x: 3070, y: 1800 },
    { x: 3220, y: 1756 },
    { x: 3410, y: Y(RIVER_ROW) },
    { x: X(COLS - 1) + 75, y: Y(RIVER_ROW) },
  ],
  // 6 moorings: berth on open water (onWater === true) right beside a walkable stone quay.
  moorings: [
    { id: "quai-ouest", x: X(1) + 90, y: riverTop + 14, a: 0, quay: { x: X(1) + 90, y: riverTop - 12 } },
    { id: "quai-contrainte", x: X(5), y: riverTop + 14, a: 0, quay: { x: X(5), y: riverTop - 12 } },
    { id: "quai-tour", x: X(2), y: riverBottom - 14, a: 0, quay: { x: X(2), y: riverBottom + 12 } },
    { id: "ile-parvis", x: X(9), y: island.bottom + 14, a: Math.PI, quay: { x: X(9), y: island.bottom - 12 } },
    { id: "quai-marais", x: X(12) + 90, y: riverTop + 14, a: 0, quay: { x: X(12) + 90, y: riverTop - 12 } },
    { id: "quai-docks", x: X(13) + 90, y: riverBottom - 14, a: Math.PI, quay: { x: X(13) + 90, y: riverBottom + 12 } },
  ],
};

// Petite Ceinture ring railway: closed clockwise loop around the entire city on an elevated viaduct.
const ringLeft = (X(0) + X(1)) / 2; // 220
const ringRight = (X(14) + X(15)) / 2; // 4280
const ringTop = Y(1) + pierDepth; // ~271.65
const ringBottom = Y(11) + pierDepth; // ~2551.65

const ring = {
  northRow: 1,
  southRow: 11,
  minCol: 1,
  maxCol: 14,
  left: ringLeft,
  right: ringRight,
  top: ringTop,
  bottom: ringBottom,
  cornerR: 36,
  deckLift: 40,
  stations: [
    {
      id: "porte-etoile",
      name: { fr: "Porte de l’Étoile", en: "Star Gate" },
      stop: { x: X(3) + 88, y: ringTop },
      street: { x: X(3) + 88, y: Y(1) - 21 },
    },
    {
      id: "butte-creancier",
      name: { fr: "Butte-du-Créancier", en: "Creditor Hill" },
      stop: { x: X(8) + 88, y: ringTop },
      street: { x: X(8) + 88, y: Y(1) - 21 },
    },
    {
      id: "buttes-fiscales",
      name: { fr: "Buttes-Fiscales", en: "Tax Hills" },
      stop: { x: X(12) + 88, y: ringTop },
      street: { x: X(12) + 88, y: Y(1) - 21 },
    },
    {
      id: "viaduc-est",
      name: { fr: "Viaduc-Est", en: "East Viaduct" },
      stop: { x: ringRight, y: Y(4) - 18 },
      street: { x: ringRight - 22, y: Y(4) - 18 },
    },
    {
      id: "porte-docks",
      name: { fr: "Porte des Docks", en: "Docks Gate" },
      stop: { x: X(12) + 88, y: ringBottom },
      street: { x: X(12) + 88, y: Y(11) - 21 },
    },
    {
      id: "gare-sud",
      name: { fr: "Gare du Sud", en: "South Station" },
      stop: { x: X(8) + 88, y: ringBottom },
      street: { x: X(8) + 88, y: Y(11) - 21 },
    },
    {
      id: "champ-fer",
      name: { fr: "Champ-de-Fer", en: "Iron Field" },
      stop: { x: X(3) + 88, y: ringBottom },
      street: { x: X(3) + 88, y: Y(11) - 21 },
    },
    {
      id: "viaduc-ouest",
      name: { fr: "Viaduc-Ouest", en: "West Viaduct" },
      stop: { x: ringLeft, y: Y(5) - 18 },
      street: { x: ringLeft + 22, y: Y(5) - 18 },
    },
  ],
};

// 7 Paris-inspired Port-Fer monuments.
const monuments = [
  {
    id: "arc-saisies",
    name: { fr: "Arc des Saisies", en: "Arch of Seizures" },
    col: 3,
    row: 3,
    x: X(3),
    y: Y(3),
    footprint: octagon(X(3), Y(3), 15, 13),
    style: "arch",
  },
  {
    id: "tour-fer",
    name: { fr: "Tour de Fer", en: "Iron Tower" },
    col: 3,
    row: 8,
    x: X(3),
    y: Y(8),
    // Outer base footprint for map/visuals; passUnder=true uses the 4 corner iron legs as collision piers so roads pass beneath.
    footprint: boxPoly(X(3) - 44, Y(8) - 42, X(3) + 44, Y(8) + 42),
    passUnder: true,
    piers: [
      boxPoly(X(3) - 44, Y(8) - 42, X(3) - 29, Y(8) - 30),
      boxPoly(X(3) + 29, Y(8) - 42, X(3) + 44, Y(8) - 30),
      boxPoly(X(3) - 44, Y(8) + 27, X(3) - 29, Y(8) + 41),
      boxPoly(X(3) + 29, Y(8) + 27, X(3) + 44, Y(8) + 41),
    ],
    style: "tower",
  },
  {
    id: "place-contrainte",
    name: { fr: "Place de la Contrainte", en: "Writ Square Obelisk" },
    col: 6,
    row: 5,
    x: X(6),
    y: Y(5),
    footprint: octagon(X(6), Y(5), 11, 10),
    style: "obelisk",
  },
  {
    id: "hotel-ventes",
    name: { fr: "Hôtel des Ventes", en: "Grand Auction House" },
    col: 7,
    row: 3,
    x: X(7) + 74,
    y: Y(3) - 62,
    footprint: boxPoly(X(7) + 36, Y(3) - 96, X(7) + 114, Y(3) - 33),
    style: "opera",
  },
  {
    id: "sacre-creancier",
    name: { fr: "Sacré-Créancier", en: "Sacred Creditor Basilica" },
    col: 8,
    row: 0,
    x: X(8),
    y: Y(0) - 52,
    footprint: boxPoly(X(8) - 64, 8, X(8) + 64, Y(0) - 33),
    style: "basilica",
  },
  {
    id: "palais-justice",
    name: { fr: "Palais de Justice", en: "Law Courts" },
    col: 8,
    row: 7,
    x: X(8) - 64,
    y: Y(7) - 49,
    footprint: boxPoly(X(8) - 98, Y(7) - 68, X(8) - 31, Y(7) - 31),
    style: "palais",
  },
  {
    id: "notre-dame-port",
    name: { fr: "Notre-Dame-du-Port", en: "Our Lady of the Port" },
    col: 10,
    row: 7,
    x: X(10) + 66,
    y: Y(7),
    footprint: boxPoly(X(10) + 33, Y(7) - 60, X(10) + 98, Y(7) + 60),
    style: "cathedral",
  },
];

// Three Parisian night parks rendered as landscaped garden squares.
const parks = [
  { id: "champ-de-fer", name: { fr: "Jardin du Champ-de-Fer", en: "Iron Field Gardens" }, cols: [3, 4], rows: [9, 9] },
  { id: "buttes-fiscales", name: { fr: "Parc des Buttes-Fiscales", en: "Tax-Hill Park" }, cols: [14, 14], rows: [3, 4] },
  { id: "jardin-senat", name: { fr: "Jardin du Sénat-des-Clercs", en: "Clerks' Senate Garden" }, cols: [7, 7], rows: [9, 9] },
];

export const definition = {
  blocks,
  cellKinds,
  canalRow: CANAL_ROW,
  river,
  roads: buildParisRoads(),
  ring,
  monuments,
  parks,
  railways: [],
  // 5 case addresses relocated to central Paris-Port-Fer landmarks (all verified clear of props & obstacles).
  addresses: [
    { id: "office", col: 7, row: 5, dx: 78, dy: -21, symbol: "É", color: "#ffc857" },
    { id: "repo", col: 5, row: 4, dx: 64, dy: -21, symbol: "R", color: "#ff79ae" },
    { id: "noise", col: 9, row: 5, dx: -64, dy: -21, symbol: "C", color: "#64ebd0" },
    { id: "flat", col: 6, row: 6, dx: 72, dy: -22, symbol: "S", color: "#ffa851" },
    { id: "auction", col: 7, row: 3, dx: 62, dy: -22, symbol: "A", color: "#c2a0ff" },
  ],
  interiors: [
    {
      door: "office",
      image: "officeInterior",
      width: 160,
      height: 100,
      floor: { left: 14, right: 146, top: 63, bottom: 94 },
      entry: { x: 80, y: 90 },
      exit: { x: 80, y: 93 },
      desk: { x: 80, y: 65 },
      action: "caseDesk",
    },
  ],
  buildPiers: buildRingPiers,
};

export const town = buildTown(definition);
export const { blocks: city, width: W, height: H, jobs, roadsX, roadsY, canalRow } = town;
export const office = town.byId.get("office"),
  auction = town.byId.get("auction");
export const canalTop = town.river.top,
  canalBottom = town.river.bottom;
