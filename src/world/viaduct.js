// Registration of the market painting and the repeated iron span in world units.
import { CELL_H, CELL_W } from "./layout.js";

import { kerbX, kerbY, plateRegistration } from "./street-props.js";
export const railScaleY = (CELL_H / 2 - kerbY) / 429;
export const railTop = 161,
  deckBottom = 236,
  foot = 378;
export const bayWidth = CELL_W / 5;
export const marketPiers = [88, 406, 602, 898, 1259, 1469];
export const pierDepth = -CELL_H / 2 + foot * railScaleY;

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
  return sections[Number(blocks[col - 1] === "market")][Number(blocks[col + 1] === "market")];
}
