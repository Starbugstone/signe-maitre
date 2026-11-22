// Registration of the market painting, repeated iron spans, and the Petite Ceinture ring viaduct piers.
import { CELL_H, CELL_W, X, Y } from "./layout.js";
import { kerbX, kerbY, plateRegistration } from "./street-props.js";
import { fromSource, paintings } from "./paintings.js";

export const railScaleY = (CELL_H / 2 - kerbY) / 429;
export const railTop = 161,
  deckBottom = 236,
  foot = 378;
export const bayWidth = CELL_W / 5;
export const marketPiers = [88, 406, 602, 898, 1259, 1469];
export const pierDepth = -CELL_H / 2 + foot * railScaleY;
export const pierThickness = 3.5;

export function marketColumnX(pixel) {
  const [left, centre, right] = plateRegistration.market[0];
  if (pixel <= left) return -CELL_W / 2 + (pixel * (CELL_W / 2 - kerbX)) / left;
  if (pixel <= centre) return ((pixel - centre) * kerbX) / (centre - left);
  if (pixel <= right) return ((pixel - centre) * kerbX) / (right - centre);
  return kerbX + ((pixel - right) * (CELL_W / 2 - kerbX)) / (1500 - right);
}
// The easternmost pier of every painted span stands at the edge of the seam lane. Its base
// stops short of the lane's centre line so that the lane stays open to a walker or a motorbike.
const laneSide = CELL_W / 2 - 3.5;
const clearLane = ([west, east]) => [west, Math.min(east, laneSide)];
const marketBases = marketPiers.map((x) => clearLane([marketColumnX(x - 21), marketColumnX(x + 21)]));
const spanBases = Array.from({ length: 6 }, (_, i) => {
  const x = (i - 2.5) * bayWidth;
  return [Math.max(-CELL_W / 2, x - (20 * bayWidth) / 296), Math.min(CELL_W / 2, x + (22 * bayWidth) / 296)];
});

// At a market boundary the adjoining span lands on the pier in the painting.
// Ending it on the cell edge instead leaves half a pier in the alley.
function joinedSection(westExtension, eastExtension) {
  return {
    westExtension,
    eastExtension,
    bases: spanBases.slice(westExtension ? 1 : 0, eastExtension ? -1 : undefined),
  };
}
const lastMarketPier = CELL_W / 2 - marketColumnX(marketPiers.at(-1));
const firstMarketPier = CELL_W / 2 + marketColumnX(marketPiers[0]);
const sections = [
  [joinedSection(0, 0), joinedSection(0, firstMarketPier)],
  [joinedSection(lastMarketPier, 0), joinedSection(lastMarketPier, firstMarketPier)],
];
const marketSection = { bases: marketBases };

// Pier bases of a baked viaduct painting, from its measured pier centre lines.
const paintedSections = new Map();
function paintedSection(key) {
  if (!paintedSections.has(key)) {
    const { source, east, piers, eastPiers = [] } = paintings[key].viaduct;
    const west = fromSource(source, { ring: true }).x,
      far = east ? fromSource(east, { ring: true }).x : west;
    paintedSections.set(key, {
      bases: [...piers.map((x) => [west(x - 21), west(x + 21)]), ...eastPiers.map((x) => [far(x - 21), far(x + 21)])].map(
        clearLane,
      ),
    });
  }
  return paintedSections.get(key);
}
const cellKey = (layout, row, col) => layout.cellKinds?.[row]?.[col] ?? layout.blocks[row][col];
export const paintedViaduct = (layout, row, col) => paintings[cellKey(layout, row, col)]?.viaduct;

export function viaductSection(layout, row, col) {
  const viaduct = paintedViaduct(layout, row, col);
  if (viaduct?.market) return marketSection;
  if (viaduct) return paintedSection(cellKey(layout, row, col));
  // Iron spans over any other painting land on the outer pier of a neighbouring viaduct painting.
  const minCol = layout.ring?.minCol ?? 0;
  const maxCol = layout.ring?.maxCol ?? layout.cols - 1;
  const westViaduct = col > minCol && !!paintedViaduct(layout, row, col - 1);
  const eastViaduct = col < maxCol && !!paintedViaduct(layout, row, col + 1);
  return sections[Number(westViaduct)][Number(eastViaduct)];
}

// Where the side legs come down to the street. West: a cantilever bracket on a masonry foot
// east of the track, at the back of the north pavement and on the south kerb of each cross
// street. East: an iron portal astride the track, its two feet on the south pavement.
export const sideSupports = {
  west: { dx: 24, feet: [-28.4, 18.5], half: 4.5 },
  east: { dx: [-9.1, 9.4], feet: [24], half: 3.4 },
};

// Compute every physical ground-level pier for the closed Petite Ceinture ring viaduct.
// Horizontal legs reuse the registered market / ironwork pier bases; vertical legs place
// iron piers between east-west streets and on the river banks (leaving clear headroom over roads and water).
export function buildRingPiers(layout) {
  const ring = layout.ring;
  if (!ring) return [];
  const piers = [];
  const { northRow, southRow, minCol, maxCol, left, right, top, bottom, cornerR = 36 } = ring;
  const river = layout.river;

  // Horizontal legs (northRow and southRow, cols minCol..maxCol).
  for (const row of [northRow, southRow]) {
    if (row == null || row < 0 || row >= layout.rows) continue;
    const yFoot = Y(row) + pierDepth;
    for (let col = minCol; col <= maxCol; col++) {
      const section = viaductSection(layout, row, col);
      for (const [bLeft, bRight] of section.bases) {
        const x1 = X(col) + bLeft,
          x2 = X(col) + bRight;
        // Skip the very outer corner curve edge piers so the curve meets the vertical leg cleanly.
        if (col === minCol && x1 < left + Math.max(12, cornerR)) continue;
        if (col === maxCol && x2 > right - Math.max(12, cornerR)) continue;
        // Never drop a pier inside an intersection roadway or roundabout.
        if (Math.abs((x1 + x2) / 2 - X(col)) < 26) continue;
        piers.push({
          left: x1,
          right: x2,
          top: yFoot - pierThickness,
          bottom: yFoot,
          x: (x1 + x2) / 2,
          y: yFoot,
          orientation: "horizontal",
          row,
          col,
        });
      }
    }
  }

  // Side legs: painted supports at each cross street, and the rail-bridge abutments on the
  // two quays. Nothing stands in the river.
  const station = (x, y) => (ring.stations || []).some((st) => Math.hypot(x - st.street.x, y - st.street.y) < 9);
  for (const [side, vx] of [
    ["west", left],
    ["east", right],
  ]) {
    const support = sideSupports[side];
    // The supports stand on the kerbs of a cross street; where the block is built over
    // there is none, and the deck spans on to the next street.
    const west = Math.floor((vx - X(0)) / CELL_W);
    const crossStreet = (row) =>
      !layout.roads || layout.roads.edges.some((e) => [e.a, e.b].sort().join() === [`c${west}r${row}`, `c${west + 1}r${row}`].sort().join());
    for (let row = northRow + 1; row < southRow; row++) {
      if (row === layout.riverRow || !crossStreet(row)) continue;
      for (const dy of support.feet)
        for (const dx of [support.dx].flat()) {
          const x = vx + dx,
            y = Y(row) + dy;
          if (y < top + cornerR || y > bottom - cornerR + 40 || station(x, y - 2)) continue;
          piers.push({
            left: x - support.half,
            right: x + support.half,
            top: y - 3.5,
            bottom: y,
            x,
            y,
            orientation: "vertical",
            side,
            row,
          });
        }
    }
    if (river)
      for (const y of [river.top - 10, river.bottom + 10])
        piers.push({
          left: vx - 3.6,
          right: vx + 3.6,
          top: y - 2.6,
          bottom: y + 2.6,
          x: vx,
          y,
          orientation: "vertical",
          side,
          abutment: true,
        });
  }

  return piers;
}
