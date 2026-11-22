// Registration of the market painting, repeated iron spans, and the Petite Ceinture ring viaduct piers.
import { CELL_H, CELL_W, X, Y } from "./layout.js";
import { kerbX, kerbY, plateRegistration } from "./street-props.js";

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
const marketBases = marketPiers.map((x) => [marketColumnX(x - 21), marketColumnX(x + 21)]);
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

export function viaductSection(layout, row, col) {
  const blocks = layout.blocks[row];
  if (blocks[col] === "market") return marketSection;
  const minCol = layout.ring?.minCol ?? 0;
  const maxCol = layout.ring?.maxCol ?? layout.cols - 1;
  const westMarket = col > minCol && blocks[col - 1] === "market";
  const eastMarket = col < maxCol && blocks[col + 1] === "market";
  return sections[Number(westMarket)][Number(eastMarket)];
}

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
        if (col === minCol && x1 < left + 12) continue;
        if (col === maxCol && x2 > right - 12) continue;
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

  // Vertical legs (west leg at x = left, east leg at x = right).
  const blockedY = (py) => {
    // Keep every east-west street clear with headroom.
    for (let r = 0; r < layout.rows; r++) if (Math.abs(py - Y(r)) < 34) return true;
    // Keep open river water completely clear for boats (rail bridges span water from quay abutments).
    if (river && py > river.top - 5 && py < river.bottom + 5) return true;
    // Keep ring station street stairs clear.
    for (const st of ring.stations || []) if (Math.hypot(0, py - st.street.y) < 16) return false;
    return false;
  };

  for (const [side, vx] of [
    ["west", left],
    ["east", right],
  ]) {
    const startY = top + cornerR + 18;
    const endY = bottom - cornerR - 18;
    // Place regular piers between streets (approx 57u apart) plus river bank abutments.
    const ys = [];
    for (let r = northRow; r < southRow; r++) {
      const mid = (Y(r) + Y(r + 1)) / 2;
      for (const offset of [-32, 32]) {
        const py = mid + offset;
        if (py >= startY && py <= endY && !blockedY(py)) ys.push(py);
      }
    }
    // Add sturdy rail-bridge abutments on the north and south banks of la Ferre.
    if (river) {
      for (const py of [river.top - 10, river.bottom + 10]) {
        if (py >= startY && py <= endY) ys.push(py);
      }
    }
    // Deduplicate nearby piers and skip station stair footprints.
    ys.sort((a, b) => a - b);
    const chosen = [];
    for (const py of ys) {
      if (chosen.length && py - chosen.at(-1) < 22) continue;
      if ((ring.stations || []).some((st) => Math.hypot(vx - st.street.x, py - st.street.y) < 18)) continue;
      chosen.push(py);
      piers.push({
        left: vx - 3.6,
        right: vx + 3.6,
        top: py - 2.6,
        bottom: py + 2.6,
        x: vx,
        y: py,
        orientation: "vertical",
        side,
      });
    }
  }

  return piers;
}
