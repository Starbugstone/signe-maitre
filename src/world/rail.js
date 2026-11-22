import { plates, plateScale } from "./streets.js";
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
import { paintedViaduct } from "./viaduct.js";
import { drawSideDeck, sideSupportSprites, spanForeground } from "./ring-art.js";

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

// Draw one horizontal ring leg (row 1 or row 11, cols minCol..maxCol): the piers with the
// street they stand on (`overhead` false), or the deck over everyone beneath it.
function drawHorizontalLeg(row, firstCol, lastCol, overhead) {
  const ring = town.ring;
  const minC = Math.max(firstCol, ring.minCol),
    maxC = Math.min(lastCol, ring.maxCol);
  if (minC > maxC) return;
  const top = Y(row) - CELL_H / 2,
    start = overhead ? railTop : deckBottom,
    end = overhead ? deckBottom : foot,
    y = top + start * railScaleY,
    height = (end - start) * railScaleY;

  g.save();
  // The straight run ends where the corner decks take over.
  g.beginPath();
  g.rect(ring.left + ring.cornerR - 2, top, ring.right - ring.left - 2 * ring.cornerR + 4, CELL_H);
  g.clip();
  for (let col = minC; col <= maxC; col++) {
    const x = X(col) - CELL_W / 2;
    const viaduct = paintedViaduct(town, row, col);
    if (viaduct?.market) {
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
    } else if (viaduct) {
      // A baked span: its own deck and piers, with a station's canopies above the deck.
      const span = spanForeground(town.cellKinds[row][col]);
      const from = overhead ? span.origin : span.deck,
        to = overhead ? span.deck : span.foot;
      g.drawImage(
        span.image,
        0,
        (from - span.origin) * plateScale,
        span.image.width,
        (to - from) * plateScale,
        x,
        Y(row) + from,
        CELL_W + 0.02,
        to - from,
      );
    } else {
      const strip = streetSpan(viaductSection(town, row, col));
      g.drawImage(strip, 0, start - railTop, strip.width, end - start, x, y, CELL_W + 0.02, height);
    }
  }
  g.restore();
}

export function visibleRails(ox, oy) {
  const ring = town.ring;
  if (!ring) return [];
  const { firstCol, lastCol } = town.visibleCells(ox, oy - 24, game.vw, game.vh + 64);
  const rails = [];

  // 1. Horizontal Petite Ceinture legs (row 1 and row 11).
  for (const row of [ring.northRow, ring.southRow]) {
    if (row == null) continue;
    const y = Y(row) + pierDepth;
    if (y < oy - 12 || Y(row) - CELL_H / 2 + railTop * railScaleY - 22 > oy + game.vh) continue;
    rails.push({
      y,
      draw: (overhead) => drawHorizontalLeg(row, firstCol, lastCol, overhead),
    });
  }

  // 2. The painted supports of the side legs, each sorted with the street at its foot.
  rails.push(...sideSupportSprites(ox, oy));

  // 3. Overhead: the side-leg and corner decks. The trains ride on them: the renderer calls
  // drawRingTrains from src/art/train.js once all the overhead layers are down, then
  // drawOverTrain for whatever stands over a train (rail-bridge bracing, platform canopies).
  rails.push({
    y: -1e9,
    draw: (overhead) => {
      if (overhead) drawSideDeck(ox, oy);
    },
  });

  return rails;
}
