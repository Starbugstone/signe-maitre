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

// The river plates run from the north quay cap to the Quai Sud kerb (see the bake recipes).
export const riverPlate = { top: -201, height: 412.2 };

function mapper(source, target) {
  return (v) => {
    let i = source.findIndex((stop, k) => k > 0 && v <= stop) - 1;
    if (i < 0) i = source.length - 2;
    return target[i] + ((target[i + 1] - target[i]) * (v - source[i])) / (source[i + 1] - source[i]);
  };
}
const xTargets = [-CELL_W / 2, -kerbX, 0, kerbX, CELL_W / 2],
  yTargets = [-CELL_H / 2, -kerbY, 0, kerbY, CELL_H / 2];

// Measured kerbs: [west, centre, east], [north, centre, south].
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
  riverBridge: [[666, 754, 842]],
  riverIronBridge: [[667, 753, 839]],
};
kerbs.rondPoint = kerbs.obeliskSquare;

// Source pixel -> world units from the cell centre, for a painting registered on its kerbs.
export function fromSource(key, { ring = false } = {}) {
  const [xs, ys] = kerbs[key];
  const x = mapper([0, ...xs, 1500], xTargets);
  const y = ring
    ? mapper([0, 182, 378, ...ys, 1000], [-CELL_H / 2, ringDeck, ringFoot, ...yTargets.slice(1)])
    : mapper([0, ...ys, 1000], yTargets);
  return { x, y, point: ([px, py]) => [x(px), y(py)] };
}

// River plates keep their rows in source pixels: rigid bands hang off the two banks and the
// two island edges, the rest is drawn out between them.
const riverRows = {
  northBank: (py) => -186 + (py - 225) / plateScale,
  southBank: (py) => 186 + (py - 813) / plateScale,
  islandNorth: (py) => -78 + (py - 380) / plateScale,
  islandSouth: (py) => 78 + (py - 655) / plateScale,
};
const riverColumns = {
  river: mapper([0, 1500], [-CELL_W / 2, CELL_W / 2]),
  islandCathedral: mapper([0, 1500], [-CELL_W / 2, CELL_W / 2]),
  riverBridge: mapper([0, ...kerbs.riverBridge[0], 1500], xTargets),
  riverIronBridge: mapper([0, ...kerbs.riverIronBridge[0], 1500], xTargets),
  islandWest: mapper([0, 82, 666, 752, 839, 1500], [-CELL_W / 2, -108, -kerbX, 0, kerbX, CELL_W / 2]),
  islandEast: mapper([0, 665, 754, 843, 1398, 1500], [-CELL_W / 2, -kerbX, 0, kerbX, 108, CELL_W / 2]),
};
export function fromRiver(key, band) {
  const x = riverColumns[key],
    y = riverRows[band];
  return { x, y, point: ([px, py]) => [x(px), y(py)] };
}
// The island's pointed ends follow the painted quay wall between the two rigid bands.
const noseRow = mapper([380, 458, 505, 655], [-78, -78 + 78 / plateScale, 78 - 150 / plateScale, 78]);
export const islandNose = (key, points) => points.map(([px, py]) => [riverColumns[key](px), noseRow(py)]);

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

// `arms`: road arms the painting shows. `viaduct`: source pixels of the pier centre lines.
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
  opera: { arms: "nesw" },
  basilica: { arms: "nesw" },
  palaisJustice: { arms: "nesw" },
  towerBase: { arms: "nesw" },
  starArch: { arms: "nesw", roundabout: true },
  obeliskSquare: { arms: "nesw", roundabout: true },
  rondPoint: { arms: "nesw", roundabout: true },
  alleyCross: { arms: "", alleys: "nesw" },
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
  islandWest: { river: true, bridge: true, island: true },
  islandCathedral: { river: true, island: true },
  islandEast: { river: true, bridge: true, island: true },
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

// Collision and silhouettes of Île de la Ferre, from the island paintings.
{
  const west = [[82, 502], [150, 438], [300, 406], [400, 385], [500, 380]],
    westSouth = [[82, 502], [100, 550], [150, 599], [200, 618], [300, 637], [375, 648], [480, 657]];
  const east = [[1009, 380], [1115, 388], [1200, 402], [1300, 429], [1350, 447], [1398, 493]],
    eastSouth = [[1398, 493], [1375, 537], [1350, 565], [1300, 590], [1200, 628], [1125, 640], [1030, 657]];
  // Water inside the island's bounding box: the four corners outside the painted quay wall.
  paintings.islandWest.solids = [
    [[-CELL_W / 2, -80], ...islandNose("islandWest", west).reverse(), [-110, 0], [-CELL_W / 2, 0]],
    [[-CELL_W / 2, 80], [-CELL_W / 2, 0], [-110, 0], ...islandNose("islandWest", westSouth)],
  ];
  paintings.islandEast.solids = [
    [[CELL_W / 2, -80], [CELL_W / 2, 0], [110, 0], ...islandNose("islandEast", east).reverse()],
    [[CELL_W / 2, 80], ...islandNose("islandEast", eastSouth).reverse(), [110, 0], [CELL_W / 2, 0]],
  ];
  // Notre-Dame-du-Port stands on the north apron.
  const c = fromRiver("islandCathedral", "islandNorth");
  paintings.islandCathedral.solids = [rectangle(c.x(360), -80, c.x(1256), c.y(431))];
  paintings.islandCathedral.cathedral = rectangle(c.x(360), c.y(160), c.x(1256), c.y(431));
}

export const paintingKeys = Object.keys(paintings);
