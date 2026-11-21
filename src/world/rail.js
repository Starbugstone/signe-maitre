import { plates, plateScale } from "./streets.js";
import { trainPosition } from "./layout.js";
import { CELL_H, CELL_W, X, Y, town } from "./town.js";
import { artwork, game } from "../core/state.js";
import { g } from "../platform/canvas.js";

import {
  railTop,
  deckBottom,
  foot,
  railScaleY,
  bayWidth,
  pierDepth,
  marketPiers,
  marketColumnX,
  viaductSection,
} from "./viaduct.js";

// The market artist painted one full open span between these two pier centre lines.
// Extract its silhouette once, keeping the roadway visible through the ironwork.
const leftPier = 602,
  rightPier = 898;
let bay;
function viaductBay() {
  if (bay) return bay;
  bay = document.createElement("canvas");
  bay.width = rightPier - leftPier;
  bay.height = foot - railTop;
  const ctx = bay.getContext("2d");
  ctx.translate(-leftPier, -railTop);
  const outline = [
    [602, 161],
    [898, 161],
    [898, 377],
    [878, 377],
    [878, 361],
    [882, 351],
    [884, 327],
    [887, 321],
    [887, 274],
    [880, 261],
    [864, 251],
    [846, 244],
    [832, 236],
    [669, 236],
    [648, 241],
    [628, 251],
    [616, 263],
    [615, 319],
    [620, 327],
    [620, 350],
    [624, 360],
    [624, 377],
    [602, 377],
  ];
  ctx.beginPath();
  for (const [x, y] of outline) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(artwork.market, 0, 0);
  // The road seen through the truss in the original painting is background, not metal.
  clearTrussOpenings(
    ctx,
    (x) => x,
    (y) => y,
  );
  return bay;
}
function clearTrussOpenings(ctx, sourceX, sourceY) {
  ctx.globalCompositeOperation = "destination-out";
  for (let x = 666; x < 830; x += 24) {
    for (const tri of [
      [
        [x + 2, 214],
        [x + 19, 214],
        [x + 11, 222],
      ],
      [
        [x + 2, 231],
        [x + 19, 231],
        [x + 11, 225],
      ],
    ]) {
      ctx.beginPath();
      for (const [a, b] of tri) ctx.lineTo(sourceX(a), sourceY(b));
      ctx.closePath();
      ctx.fill();
    }
  }
}

// Only the silhouette needs repainting on a market block. The street and façades
// visible between the columns are already in the cached ground layer.
let marketRail;
function marketForeground() {
  if (marketRail) return marketRail;
  const plate = plates.market;
  marketRail = document.createElement("canvas");
  marketRail.width = plate.width;
  marketRail.height = Math.ceil((foot - railTop) * railScaleY * plateScale);
  const ctx = marketRail.getContext("2d");
  const px = (u) => (marketColumnX(u) + CELL_W / 2) * plateScale;
  const py = (v) => (v - railTop) * railScaleY * plateScale;
  // prettier-ignore
  const outline = [[-64,236],[-35,247],[-17,260],[-11,270],[-11,322],[-15,328],[-16,348],[-20,359],[-20,377],
    [20,377],[20,359],[16,348],[15,328],[11,322],[11,270],[17,260],[35,247],[64,236]];
  ctx.beginPath();
  ctx.rect(0, 0, plate.width, py(deckBottom));
  for (const pier of marketPiers) {
    ctx.moveTo(px(pier + outline[0][0]), py(outline[0][1]));
    for (const [dx, y] of outline) ctx.lineTo(px(pier + dx), py(y));
    ctx.closePath();
  }
  ctx.clip();
  ctx.drawImage(plate, 0, -railTop * railScaleY * plateScale);
  clearTrussOpenings(ctx, px, py);
  return marketRail;
}
const streetSpans = new Map();
function streetSpan(section) {
  if (streetSpans.has(section)) return streetSpans.get(section);
  const source = viaductBay(),
    w = source.width,
    h = source.height;
  const strip = document.createElement("canvas");
  strip.width = w * 5;
  strip.height = h;
  const ctx = strip.getContext("2d");
  // Keep the shafts and their arch ends at the original scale. Only extend
  // the open truss to reach the real pier beyond a painting boundary.
  const arch = 68;
  for (let i = 0; i < 5; i++) {
    const x = i * w;
    const west = i === 0 ? (section.westExtension * w) / bayWidth : 0;
    const east = i === 4 ? (section.eastExtension * w) / bayWidth : 0;
    if (!west && !east) {
      ctx.drawImage(source, x, 0);
      continue;
    }
    const left = Math.round(x - west),
      right = Math.round(x + w + east);
    ctx.drawImage(source, 0, 0, arch, h, left, 0, arch, h);
    ctx.drawImage(source, arch, 0, w - 2 * arch, h, left + arch, 0, right - left - 2 * arch, h);
    ctx.drawImage(source, w - arch, 0, arch, h, right - arch, 0, arch, h);
  }
  streetSpans.set(section, strip);
  return strip;
}
function drawRailLayer(row, firstCol, lastCol, overhead, ox) {
  const top = Y(row) - CELL_H / 2,
    start = overhead ? railTop : deckBottom,
    end = overhead ? deckBottom : foot,
    y = top + start * railScaleY,
    height = (end - start) * railScaleY;
  for (let col = firstCol; col <= lastCol; col++) {
    const x = X(col) - CELL_W / 2;
    if (town.blocks[row][col] === "market") {
      const rail = marketForeground();
      g.drawImage(
        rail,
        0,
        (start - railTop) * railScaleY * plateScale,
        rail.width,
        height * plateScale,
        x,
        y,
        CELL_W + 0.02,
        height,
      );
    } else {
      const strip = streetSpan(viaductSection(town, row, col));
      g.drawImage(strip, 0, start - railTop, strip.width, end - start, x, y, CELL_W + 0.02, height);
    }
  }
  if (!overhead) return;
  const { head, carLength, gap, count } = trainPosition(town.lines.get(row), town.width, game.time);
  const h = (carLength * artwork.metro.height) / artwork.metro.width;
  for (let i = 0; i < count; i++) {
    const x = head - carLength - i * (carLength + gap);
    if (x + carLength >= ox && x <= ox + game.vw) g.drawImage(artwork.metro, x, y + 1.5 - h, carLength, h);
  }
}
export function visibleRails(ox, oy) {
  const { firstRow, lastRow, firstCol, lastCol } = town.visibleCells(ox, oy - 18, game.vw, game.vh + 36);
  const rails = [];
  for (let row = firstRow; row <= lastRow; row++) {
    const y = Y(row) + pierDepth;
    if (!town.lines.has(row) || y < oy || Y(row) - CELL_H / 2 + railTop * railScaleY - 18 > oy + game.vh)
      continue;
    rails.push({ y, draw: (overhead) => drawRailLayer(row, firstCol, lastCol, overhead, ox) });
  }
  return rails;
}
