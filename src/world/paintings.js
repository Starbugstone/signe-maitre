// What each street painting shows, in world units from its cell's intersection.
// The paintings are baked by tools/art/bake-scenery.mjs onto the plate grid (5 px per unit,
// kerbs on the shared kerb lines), so the numbers here stay in the source pixels that
// art-src/scenery/manifest.json and the artists' hand-offs use, and are converted once.
import { CELL_H, CELL_W } from "./layout.js";

export const kerbX = 17.6,
  kerbY = 16.8;
export const plateScale = 5;

// Ring deck: pier feet on the pavement line of the first paintings, deck 40 units above them.
export const ringFoot = (378 * (CELL_H / 2 - kerbY)) / 429 - CELL_H / 2, // -28.36
  ringDeck = ringFoot - 40;

// A river plate runs from the south kerb of Quai Nord to the Quai Sud kerb. Its painting is
// 1500 × 2130 px for 290 × 412.2 units and starts `approach` units below the plate's top, the
// band between being quay setts (see the bake recipes).
export const riverPlate = { top: -211, height: 422.2, approach: 10, source: [1500, 2130] };

function mapper(source, target) {
  return (v) => {
    let i = source.findIndex((stop, k) => k > 0 && v <= stop) - 1;
    if (i < 0) i = source.length - 2;
    return target[i] + ((target[i + 1] - target[i]) * (v - source[i])) / (source[i + 1] - source[i]);
  };
}
export const alleyHalf = 7;
const xTargets = [-CELL_W / 2, -kerbX, 0, kerbX, CELL_W / 2],
  yTargets = [-CELL_H / 2, -kerbY, 0, kerbY, CELL_H / 2];

// Measured kerbs: [west, centre, east], [north, centre, south]. A painting with ruelles also
// gives the feet of their walls, [near, centre, far] across each lane: `x` for a lane that
// runs north or south, `y` for one that runs east or west. Where an axis has no wide street
// (`null`), the lane alone registers it.
const kerbs = {
  haussmann: [[660, 749, 838], [426, 498, 569]],
  haussmannCafe: [[660, 750, 840], [426, 497, 568]],
  boulevard: [[660, 749, 838], [427, 498, 569]],
  starArch: [[668, 752, 836], [430, 501, 572]],
  obeliskSquare: [[670, 751, 831], [431, 501, 570]],
  towerBase: [[656, 750, 843], [430, 498, 566]],
  opera: [[661, 750, 840], [426, 497, 568]],
  basilica: [[660, 750, 839], [426, 498, 569]],
  palaisJustice: [[660, 750, 840], [426, 496, 566]],
  park: [[661, 750, 840], [426, 498, 569]],
  marketHall: [[660, 750, 839], [425, 497, 569]],
  teeNorth: [[660, 750, 839], [426, 498, 569]],
  ringNorth: [[668, 753, 838], [430, 500, 570]],
  ringCornerNE: [[667, 752, 838], [430, 500, 571]],
  ringCornerNW: [[668, 753, 838], [429, 501, 573]],
  ringStationNorth: [[668, 753, 838], [430, 500, 570]],
  teeSouth: [[662, 750, 838], [428, 499, 570]],
  alleyEast: [[662, 750, 838], [428, 499, 570]],
  alleySouth: [[662, 750, 838], [427, 498, 569]],
  alleySouthB: [[662, 750, 838], [428, 499, 570]],
  alleyNorth: [[662, 750, 838], [428, 499, 570]],
  alleyNorthB: [[662, 749.5, 837], [428, 499, 570]],
};
kerbs.rondPoint = kerbs.obeliskSquare;
const lanes = {
  alleyCross: { x: [724, 749, 774], y: [474, 499, 524] },
  alleyCrossB: { x: [714, 750, 786], y: [468, 499, 530] },
  alleyEast: { y: [468, 499, 530] },
  alleySouth: { x: [714, 749.5, 785] },
  alleySouthB: { x: [714, 750, 786] },
  alleyNorth: { x: [714, 750, 786] },
  alleyNorthB: { x: [714, 750, 786] },
};

// Source stops and their targets along one axis: the frame, the kerbs of the wide street and
// the walls of a ruelle, whichever the painting has.
function stops(size, half, kerb, lane, wide) {
  const source = [0, size],
    target = [-half, half];
  const add = (px, units) => {
    const at = source.findIndex((stop) => stop > px);
    source.splice(at, 0, px);
    target.splice(at, 0, units);
  };
  if (kerb) for (const [i, units] of [-wide, 0, wide].entries()) add(kerb[i], units);
  if (lane) for (const [i, units] of [-alleyHalf, 0, alleyHalf].entries()) if (!kerb || i !== 1) add(lane[i], units);
  return { source, target };
}
// How a painting is laid on its plate, in world units from the cell centre.
export function registration(key) {
  const [kx, ky] = kerbs[key] || [],
    lane = lanes[key] || {};
  return { x: stops(1500, CELL_W / 2, kx, lane.x, kerbX), y: stops(1000, CELL_H / 2, ky, lane.y, kerbY) };
}

// Source pixel -> world units from the cell centre, for a painting registered on its kerbs.
export function fromSource(key, { ring = false } = {}) {
  const r = registration(key);
  const x = mapper(r.x.source, r.x.target);
  const y = ring
    ? mapper([0, 182, 378, ...kerbs[key][1], 1000], [-CELL_H / 2, ringDeck, ringFoot, ...yTargets.slice(1)])
    : mapper(r.y.source, r.y.target);
  return { x, y, point: ([px, py]) => [x(px), y(py)] };
}

// La Ferre as painted, hand-marked in the pixels of art-src/scenery/<key>Tall.png.
//   kerbs   west, centre and east kerb of the through road
//   deck    the bridge from parapet to parapet: it stands over the water traffic
//   walk    half the width a walker or a car has between the parapets, world units
//   lamps   [x, finial, foot] of each standing lantern
//   piers   [left, top, right, bottom] of masonry standing in the water, for boats
//   over    silhouettes that rise in front of passing boats. `keyed` shapes are loose: the
//           bake keeps only what is not water inside them
//   island  the quay wall of Île de la Ferre at the waterline
//   solids  what a walker or a car cannot enter: [left, top, right, bottom] or a polygon
//   trees   [trunk x, foot, crown centre y, crown half-width, crown half-height]
//   tall    other silhouettes with ground behind them: { outline, foot }
// The east half of a symmetrical bridge is the west half turned about `axis`.
// A standing lantern's silhouette: [fraction of its height from the finial, half-width / height].
export const lantern = [
  [0, 0.03], [0.06, 0.05], [0.1, 0.2], [0.16, 0.21], [0.4, 0.14], [0.45, 0.07], [0.5, 0.05], [0.74, 0.05], [0.8, 0.09],
  [0.92, 0.1], [0.96, 0.15], [1, 0.16],
];
const turned = (axis, shapes) => [...shapes, ...shapes.map((shape) => shape.map(([x, y]) => [2 * axis - x, y]).reverse())];
const bankLamps = (...xs) => xs.map((x) => [x, 1925, 2046]);
// A newspaper kiosk of the island garden, roof and awnings.
const KIOSK = [[172, 1215], [190, 1190], [250, 1140], [256, 1140], [318, 1190], [338, 1215], [338, 1240], [310, 1240], [310, 1292], [195, 1292], [195, 1240], [172, 1240]];
export const riverMarks = {
  river: { lamps: bankLamps(150, 750, 1350) },
  riverBridge: {
    kerbs: [667, 753, 839],
    deck: [592, 912],
    walk: 29,
    lamps: [
      ...[452, 946, 1440].flatMap((foot) => [[569, foot - 127, foot], [935, foot - 127, foot]]),
      [569, 1852, 1982], [935, 1852, 1982],
      ...bankLamps(152, 1347),
    ],
    // The north abutment, three piers at their waterline and the two south turrets. A pier's
    // bastion stands a storey above its base: a boat north of the base passes behind it.
    // The boxes sit inside the rounded bases, clear of the published river centreline.
    piers: [[515, 60, 990, 270], [465, 610, 1040, 705], [465, 1105, 1040, 1200], [470, 1585, 1035, 1684], [512, 1928, 993, 2010]],
    over: {
      keyed: turned(752, [
        [[290, 0], [290, 58], [300, 88], [350, 100], [400, 125], [440, 155], [475, 190], [500, 225], [515, 262], [518, 280], [600, 280], [600, 0]],
        [[600, 402], [520, 402], [470, 418], [445, 450], [433, 500], [435, 560], [448, 600], [452, 667], [600, 667]],
        [[600, 897], [520, 897], [470, 913], [445, 945], [433, 995], [435, 1055], [448, 1095], [452, 1162], [600, 1162]],
        [[600, 1378], [520, 1378], [470, 1394], [445, 1428], [433, 1475], [435, 1537], [452, 1580], [462, 1610], [488, 1660], [528, 1718], [566, 1762], [592, 1790], [600, 1794]],
        [[510, 1928], [600, 1922], [600, 2012], [510, 2012]],
      ]),
    },
  },
  riverIronBridge: {
    kerbs: [664, 753, 841],
    deck: [607, 897],
    walk: 19.5,
    lamps: [[152, 1925, 2046], [430, 1890, 2052], [1072, 1890, 2052], [1347, 1925, 2046]],
    // Lanterns on brackets over the roadway: [x, top, bottom of the glass, bracket].
    hanging: [362, 740, 1120, 1497, 1872].flatMap((y) => [[652, y - 47, y + 44, y + 54], [852, y - 47, y + 44, y + 54]]),
    over: {
      // The arched ribs and their pierced spandrels, either side of the deck.
      keyed: turned(752, [
        [[607, 20], [590, 60], [560, 150], [520, 270], [480, 400], [455, 520], [440, 650], [428, 800], [424, 950], [424, 1150], [430, 1300],
          [445, 1420], [470, 1500], [500, 1640], [530, 1780], [560, 1900], [585, 1990], [607, 2020]],
      ]),
    },
  },
  islandWest: {
    kerbs: [666, 753, 839],
    deck: [635, 870],
    walk: 18.4,
    lamps: [
      ...[376, 605, 966, 1320].map((x) => [x, 605, 668]),
      ...[376, 605, 968, 1324].map((x) => [x, 1350, 1408]),
      [430, 925, 1012], [564, 925, 1012], [430, 1045, 1126], [565, 1045, 1126],
      [915, 714, 775], [1411, 714, 775], [916, 837, 912], [1410, 839, 912],
      [911, 1160, 1225], [1416, 1160, 1225], [919, 1279, 1345], [1410, 1279, 1345],
      ...bankLamps(152, 1347),
    ],
    solids: [
      // The two pavilion gardens behind their railings.
      [895, 722, 1430, 915], [895, 1162, 1430, 1345],
      // The bronze on its plinth in a ring of box, and the beds of the west garden.
      [[417, 1040], [440, 998], [497, 980], [554, 998], [577, 1040], [554, 1084], [497, 1100], [440, 1084]],
      [[470, 785], [590, 785], [590, 930], [540, 935], [500, 880], [465, 850]],
      [[590, 1140], [590, 1285], [505, 1285], [500, 1230], [540, 1180]],
      [[330, 915], [400, 905], [405, 950], [345, 1000], [322, 985]],
      [[325, 1085], [345, 1070], [405, 1120], [400, 1150], [330, 1140]],
    ],
    trees: [[381, 890, 800, 80, 85], [400, 1315, 1215, 86, 88]],
    tall: [{ outline: [[478, 872], [500, 865], [512, 900], [520, 1000], [525, 1040], [470, 1040], [474, 1000], [482, 900]], foot: 1045 }],
    island: [[190, 1037], [233, 900], [267, 785], [296, 691], [311, 639], [316, 628], [1500, 628], [1500, 1445], [320, 1445], [309, 1410], [277, 1310], [236, 1180]],
  },
  islandCathedral: {
    lamps: [
      [65, 822, 912], [271, 862, 938], [1237, 862, 938], [1469, 822, 912],
      [472, 1148, 1200], [679, 1148, 1200], [825, 1148, 1200], [1034, 1148, 1200],
      [110, 1300, 1352], [625, 1300, 1352], [1250, 1300, 1352],
      ...bankLamps(150, 750, 1350),
    ],
    // Notre-Dame-du-Port from the north quay wall to its portals.
    cathedral: [150, 628, 1345, 882],
    solids: [
      [60, 720, 150, 800], [1345, 720, 1440, 800],
      // South of the street: two kiosks and the fountain garden behind its railings.
      [195, 1200, 310, 1292], [1199, 1200, 1314, 1292], [440, 1195, 1075, 1305],
    ],
    trees: [
      [85, 715, 650, 62, 62], [1415, 715, 650, 62, 62], [152, 925, 835, 78, 48], [1371, 931, 842, 78, 48],
      [140, 1242, 1180, 60, 40], [375, 1242, 1180, 60, 40], [575, 1232, 1175, 60, 40], [930, 1232, 1175, 60, 40],
      [1130, 1242, 1180, 60, 40], [1360, 1242, 1180, 60, 40],
    ],
    tall: [1, 1005].map((east) => ({ outline: KIOSK.map(([x, y]) => [x + east - 1, y]), foot: 1292 })),
    island: [[0, 628], [1500, 628], [1500, 1445], [0, 1445]],
    over: {
      // Notre-Dame-du-Port's roofs, towers and spire rise over the north channel; so do the trees at its ends.
      keyed: [
        [[165, 620], [170, 560], [190, 520], [225, 525], [232, 545], [480, 545], [480, 462], [645, 462], [645, 545], [700, 545], [704, 490],
          [722, 470], [742, 338], [758, 338], [778, 470], [797, 490], [800, 545], [855, 545], [855, 462], [1018, 462], [1018, 545],
          [1195, 545], [1200, 510], [1215, 512], [1222, 545], [1290, 575], [1330, 612], [1340, 620]],
        [[25, 620], [30, 595], [70, 582], [120, 590], [150, 620]],
        [[1350, 620], [1360, 592], [1410, 582], [1460, 590], [1480, 620]],
      ],
    },
  },
  islandEast: {
    kerbs: [667, 753, 839],
    deck: [635, 870],
    walk: 18.4,
    lamps: [
      ...[92, 336, 610, 907, 1128].map((x) => [x, 630, 693]),
      ...[84, 336, 610, 903, 1128].map((x) => [x, 1350, 1410]),
      [56, 887, 937], [644, 887, 937], [647, 1144, 1200], [866, 906, 944], [862, 1150, 1200],
      [1194, 731, 781], [1254, 919, 969], [1256, 1100, 1144],
      ...bankLamps(152, 1347),
    ],
    solids: [
      // The courts with their chapel behind, the south block, and the walled garden at the point.
      [60, 700, 628, 905], [385, 628, 528, 700], [44, 1150, 628, 1335],
      [[880, 720], [1175, 720], [1200, 800], [1270, 1040], [1200, 1290], [1175, 1330], [880, 1330]],
    ],
    trees: [[106, 925, 850, 60, 50], [581, 931, 860, 62, 50]],
    island: [[0, 630], [1181, 630], [1197, 691], [1227, 785], [1262, 900], [1310, 1049], [1260, 1180], [1219, 1310], [1185, 1410], [1180, 1445], [0, 1445]],
    over: {
      // The courts' chapel spire.
      keyed: [[[395, 650], [400, 600], [415, 590], [430, 520], [441, 458], [447, 458], [458, 520], [472, 585], [500, 590], [530, 640], [535, 650]]],
    },
  },
};

// Source pixel of a river painting -> world units from the river cell's centre. A painting
// with a through road is registered on its kerbs across the width; rows are never stretched.
const riverY = (py) => riverPlate.top + riverPlate.approach + (py * (riverPlate.height - riverPlate.approach)) / riverPlate.source[1];
export function fromRiver(key) {
  const road = riverMarks[key].kerbs;
  const x = road ? mapper([0, ...road, 1500], xTargets) : mapper([0, 1500], [-CELL_W / 2, CELL_W / 2]);
  return { x, y: riverY, point: ([px, py]) => [x(px), riverY(py)] };
}

const ellipse = (cx, cy, rx, ry, steps = 14) =>
  Array.from({ length: steps }, (_, i) => {
    const a = (i * 2 * Math.PI) / steps;
    return [+(cx + Math.cos(a) * rx).toFixed(2), +(cy + Math.sin(a) * ry).toFixed(2)];
  });
const rectangle = (left, top, right, bottom) => [
  [left, top],
  [right, top],
  [right, bottom],
  [left, bottom],
];

// Painted pier feet of the horizontal viaduct, in source pixels along the span.
const marketPiers = [88, 406, 602, 898, 1259, 1469];

// `arms`: wide road arms the painting shows; `alleys`: its ruelles. Together they are the
// roads of every cell that shows it (test/town.test.js). `viaduct`: source pixels of the pier
// centre lines.
// `solids`: what a walker or a car cannot enter, beyond the buildings. `tall`: silhouettes
// that stand in front of anyone behind their foot line ({ outline, foot } in cell units).
export const paintings = {
  market: { arms: "nesw", legacy: true, viaduct: { market: true, piers: marketPiers } },
  garage: { arms: "nesw", legacy: true },
  docks: { arms: "nesw", legacy: true },
  square: { arms: "nesw", legacy: true },
  haussmann: { arms: "nesw" },
  haussmannCafe: { arms: "nesw" },
  boulevard: { arms: "nesw" },
  marketHall: { arms: "nesw" },
  park: { arms: "nesw", garden: true },
  teeNorth: { arms: "esw" },
  teeSouth: { arms: "new" },
  alleyEast: { arms: "nsw", alleys: "e" },
  alleySouth: { arms: "new", alleys: "s" },
  alleySouthB: { arms: "new", alleys: "s" },
  alleyNorth: { arms: "esw", alleys: "n" },
  alleyNorthB: { arms: "esw", alleys: "n" },
  opera: { arms: "nesw" },
  basilica: { arms: "nesw" },
  palaisJustice: { arms: "nesw" },
  towerBase: { arms: "nesw" },
  starArch: { arms: "nesw", roundabout: true },
  obeliskSquare: { arms: "nesw", roundabout: true },
  rondPoint: { arms: "nesw", roundabout: true },
  alleyCross: { arms: "", alleys: "nesw" },
  alleyCrossB: { arms: "", alleys: "nesw" },
  ringNorth: { arms: "nesw", viaduct: { source: "ringNorth", piers: [89, 412, 609, 897, 1256, 1470] } },
  ringNorthB: {
    arms: "nesw",
    viaduct: { source: "ringCornerNE", east: "ringCornerNW", piers: [95, 411, 613], eastPiers: [879, 1250, 1470] },
  },
  ringStation: { arms: "nesw", viaduct: { source: "ringNorth", piers: [89, 412, 609, 897, 1470], station: true } },
  ringStationB: {
    arms: "nesw",
    viaduct: { source: "ringCornerNE", east: "ringCornerNW", piers: [95, 411, 613], eastPiers: [879, 1470], station: true },
  },
  river: { river: true },
  riverBridge: { river: true, bridge: true },
  riverIronBridge: { river: true, bridge: true },
  islandWest: { river: true, bridge: true },
  islandCathedral: { river: true },
  islandEast: { river: true, bridge: true },
};

{
  // Arc des Saisies: two piers and the attic over an open vault, on a planted island.
  const m = fromSource("starArch");
  const arch = [
    [683, 368], [690, 332], [715, 324], [785, 324], [810, 332], [817, 368], [817, 440], [811, 533], [770, 533],
    [770, 470], [766, 445], [750, 427], [734, 445], [729, 470], [729, 533], [689, 533], [683, 440],
  ].map(m.point);
  paintings.starArch.tall = [{ outline: arch, foot: m.y(533) }];
  paintings.starArch.island = ellipse(m.x(750), m.y(500), 19.2, 21.5);
  paintings.starArch.solids = [
    rectangle(m.x(689), m.y(505), m.x(729), m.y(533)),
    rectangle(m.x(770), m.y(505), m.x(811), m.y(533)),
  ];
}
{
  // Place de la Contrainte: the obelisk and its stepped plinth.
  const m = fromSource("obeliskSquare");
  const obelisk = [
    [750, 254], [759, 279], [763, 452], [789, 470], [789, 528], [711, 528], [711, 470], [737, 452], [740, 279],
  ].map(m.point);
  paintings.obeliskSquare.tall = [{ outline: obelisk, foot: m.y(528) }];
  // Just inside the painted kerb (19 by 21): traffic on the two small roundabouts brushes it.
  paintings.obeliskSquare.island = ellipse(m.x(750), m.y(499), 17, 19);
  // The plain roundabout keeps the plinth and carries a three-lantern standard.
  const standard = [
    [750, 318], [776, 330], [780, 372], [760, 384], [756, 452], [789, 470], [789, 528], [711, 528], [711, 470],
    [744, 452], [740, 384], [720, 372], [724, 330],
  ].map(m.point);
  paintings.rondPoint.tall = [{ outline: standard, foot: m.y(528) }];
  paintings.rondPoint.island = paintings.obeliskSquare.island;
}
{
  // Tour de Fer. The four stone shoes stand in fenced gardens; the near pair lie south of the
  // pavement. The rear gardens sit on the quay when the tower stands on the river bank.
  const m = fromSource("towerBase");
  paintings.towerBase.gardens = [
    [[400, 432], [400, 300], [378, 285], [376, 215], [398, 182], [452, 176], [486, 196], [500, 255], [655, 255], [655, 432]],
    [[845, 432], [845, 255], [880, 255], [880, 140], [930, 100], [990, 120], [1010, 200], [1040, 150], [1075, 125],
      [1110, 150], [1112, 300], [1100, 432]],
  ].map((polygon) => polygon.map(m.point));
  paintings.towerBase.solids = [
    rectangle(m.x(416), m.y(326), m.x(634), m.y(418)),
    rectangle(m.x(868), m.y(326), m.x(1090), m.y(418)),
  ];
  // Iron overhead: where the near legs cross the street, for the map and the fixtures.
  paintings.towerBase.legs = [m.x(390), m.x(1110)];
}

// La Ferre in cell units from the river cell's centre: where boats, walkers and cars stop,
// and what stands up out of the island.
{
  const [, sourceHeight] = riverPlate.source;
  for (const [key, mark] of Object.entries(riverMarks)) {
    const m = fromRiver(key),
      painting = paintings[key];
    const box = ([x0, y0, x1, y1]) => rectangle(m.x(x0), m.y(y0), m.x(x1), m.y(y1));
    const shape = (s) => (typeof s[0] === "number" ? box(s) : s.map(m.point));
    painting.walk = mark.walk;
    painting.piers = (mark.piers || []).map(([x0, y0, x1, y1]) => ({ left: m.x(x0), top: m.y(y0), right: m.x(x1), bottom: m.y(y1) }));
    // Nobody walks down the face of a quay wall: the north bank's from its cap to the water,
    // the island's south wall below its cap. A bridge passes over both.
    const spans = (from, to) => (mark.deck ? [[from, mark.deck[0]], [mark.deck[1], to]] : [[from, to]]).filter(([a, b]) => b > a);
    const walls = spans(0, 1500).map(([a, b]) => box([a, 40, b, 86]));
    if (mark.island) {
      const wall = mark.island.filter(([, y]) => y > 1400).map(([x]) => x);
      walls.push(...spans(Math.min(...wall), Math.max(...wall)).map(([a, b]) => box([a, 1425, b, 1452])));
    }
    painting.solids = [...walls, ...(mark.solids || []).map(shape)];
    // A tree: its crown in front of whoever stands behind the trunk, and the trunk itself.
    const trees = (mark.trees || []).map(([x, foot, cy, rx, ry]) => ({
      outline: [
        ...ellipse(x, cy, rx, ry, 16).filter(([, py]) => py < cy + ry * 0.85),
        [x - 10, foot],
        [x + 10, foot],
      ].sort((a, b) => Math.atan2(a[1] - cy, a[0] - x) - Math.atan2(b[1] - cy, b[0] - x)),
      foot,
      trunk: [x, foot],
    }));
    painting.solids.push(...trees.map(({ trunk: [x, foot] }) => box([x - 12, foot - 14, x + 12, foot])));
    painting.tall = [...trees, ...(mark.tall || [])].map(({ outline, foot }) => ({ outline: outline.map(m.point), foot: m.y(foot) }));
    // Lanterns hung on brackets stand in front of whoever passes on their far side.
    for (const [x, top, bottom, bracket] of mark.hanging || [])
      painting.tall.push({
        outline: [[x - 10, top], [x + 10, top], [x + 24, top + 20], [x + 20, bottom], [x - 20, bottom], [x - 24, top + 20]].map(m.point),
        foot: m.y(bracket),
      });
    if (mark.island) painting.quayWall = mark.island.map(m.point);
    if (mark.cathedral) {
      painting.cathedral = box(mark.cathedral);
      painting.solids.push(painting.cathedral);
    }
    if (sourceHeight !== 2130) throw new Error("River marks are measured on 2130-row paintings");
  }
}

// Street lanterns of the district paintings, hand-marked [x, finial, foot] in source pixels
// and checked with tools/art/review-lamps.mjs. The paintings share one framing, so most
// carry the same eight lanterns on the pavements of the north-south street.
const kerbLamps = { a: [291, 397], b: [590, 694], c: [837, 953], d: [145, 245] };
const lampRow = (rows, west = 600, east = 900) =>
  [...rows].flatMap((row) => {
    const [top, foot] = kerbLamps[row];
    const shift = row === "d" ? 28 : 0;
    return [west + shift, east - shift].filter((x) => x != null && !Number.isNaN(x)).map((x) => [x, top, foot]);
  });
for (const key of ["haussmann", "haussmannCafe", "marketHall", "park", "opera", "basilica"]) paintings[key].lamps = lampRow("abcd");
// The metro stairs take the north-east corner of the boulevard, a gate pier the law courts'.
paintings.boulevard.lamps = [...lampRow("bcd"), [600, 291, 397]];
paintings.palaisJustice.lamps = [...lampRow("bcd"), [900, 291, 397]];
paintings.towerBase.lamps = [...lampRow("bcd"), [611, 258, 338], [887, 258, 338]];
// The closed north side of the T-junction has one lantern either side of its frontage.
paintings.teeNorth.lamps = [...lampRow("bc"), [556, 290, 412], [1106, 290, 412]];
paintings.starArch.lamps = [
  [637, 4, 110], [866, 4, 110], [597, 132, 250], [906, 132, 250], [506, 598, 712], [997, 598, 712], [585, 748, 866], [917, 748, 866],
  [450, 222, 376], [1050, 262, 390], [394, 870, 990], [1104, 870, 990],
];
// Three-lantern standards around Place de la Contrainte; the plain roundabout keeps them.
paintings.obeliskSquare.lamps = [[627, 30, 194], [877, 30, 194], [597, 725, 882], [900, 725, 882], [441, 272, 410], [1030, 272, 410]];
paintings.rondPoint.lamps = paintings.obeliskSquare.lamps;
// Ring rows: a lantern at the top of the cross street, one under the viaduct and one south
// of the junction, either side. `lamps` are marked on `viaduct.source`, `eastLamps` on
// `viaduct.east`. A station hall stands where the north-east pair would be.
{
  const west = [[640, 54, 152], [550, 338, 424], [626, 600, 714]],
    east = [[865, 54, 154], [946, 342, 424], [874, 600, 712]];
  const cornerWest = [[639, 50, 152], [550, 338, 424], [626, 604, 714]],
    cornerEast = [[866, 55, 152], [946, 348, 422], [881, 611, 712]];
  paintings.ringNorth.lamps = [...west, ...east];
  paintings.ringStation.lamps = [...west, east[2]];
  Object.assign(paintings.ringNorthB, { lamps: cornerWest, eastLamps: cornerEast });
  Object.assign(paintings.ringStationB, { lamps: cornerWest, eastLamps: [cornerEast[2]] });
}

// A painting turned about its north-south street stands for the mirrored junction. The game
// turns the plate when it loads; `turned` names the painting it comes from.
const swapped = (dirs = "") => [...dirs].map((d) => ({ e: "w", w: "e" })[d] || d).join("");
for (const [key, source] of [
  ["alleyWest", "alleyEast"],
  ["teeNorthTurned", "teeNorth"],
  ["teeSouthTurned", "teeSouth"],
]) {
  const { arms, alleys, lamps } = paintings[source];
  paintings[key] = { arms: swapped(arms), ...(alleys ? { alleys: swapped(alleys) } : {}), lamps, turned: source };
}

// Party walls. The later paintings end each block in a stone pier, so that two paintings meet
// as two houses do. The earlier ones were painted to be cut by the frame: they get the same
// pier, lifted from `teeSouth`, on the blocks named here (north or south block, west or east
// edge). The bake paints it into the plates; the first four paintings get it when they load.
// Gardens, monuments that reach the frame, plazas and the viaduct's side of a ring row have none.
export const partyWall = { source: "teeSouth", width: 4.8, north: [0, 87.4], fill: [20, 6.4], south: [136.8, 225.2] };
{
  const all = ["nw", "ne", "sw", "se"],
    south = ["sw", "se"];
  const blocks = {
    garage: all, docks: all, square: all, market: south,
    haussmann: all, haussmannCafe: all, boulevard: all, marketHall: all, teeNorth: all, starArch: all,
    opera: ["ne", "sw", "se"], basilica: ["ne", "sw", "se"], palaisJustice: ["ne", "sw", "se"],
    obeliskSquare: south, rondPoint: south,
    ringNorth: south, ringNorthB: south, ringStation: south, ringStationB: south,
  };
  for (const [key, list] of Object.entries(blocks)) paintings[key].walls = list;
}

export const paintingKeys = Object.keys(paintings);
