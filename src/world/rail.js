import { plates, plateScale, kerbY } from "./streets.js";
import { trainPosition } from "./layout.js";
import { CELL_H, CELL_W, X, Y, town } from "./town.js";
import { artwork, game } from "../core/state.js";
import { g } from "../platform/canvas.js";

// The market artist painted one full open span between these two pier centre lines.
// Extract its silhouette once, keeping the roadway visible through the ironwork.
const leftPier = 602,
  rightPier = 898,
  railTop = 161,
  foot = 378;
const verticalScale = (CELL_H / 2 - kerbY) / 429;
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
      for (const [a, b] of tri) ctx.lineTo(a, b);
      ctx.closePath();
      ctx.fill();
    }
  }
  return bay;
}
export function drawRail(ox, oy) {
  const { firstRow, lastRow, firstCol, lastCol } = town.visibleCells(ox, oy, game.vw, game.vh, CELL_W / 2);
  for (let row = firstRow; row <= lastRow; row++) {
    const line = town.lines.get(row);
    if (!line) continue;
    const y = Y(row) - CELL_H / 2 + railTop * verticalScale,
      height = (foot - railTop) * verticalScale;
    if (y + height < oy || y - 18 > oy + game.vh) continue;
    const bayWidth = CELL_W / 5;
    for (let col = firstCol; col <= lastCol; col++) {
      const x = X(col) - CELL_W / 2;
      if (town.blocks[row][col] === "market") {
        // Repaint the registered foreground after actors. Cross traffic travels underneath.
        const depth = 72 * verticalScale;
        g.drawImage(
          plates.market,
          0,
          railTop * verticalScale * plateScale,
          plates.market.width,
          depth * plateScale,
          x,
          y,
          CELL_W + 0.02,
          depth,
        );
      } else {
        for (let i = 0; i < 5; i++) g.drawImage(viaductBay(), x + i * bayWidth, y, bayWidth + 0.04, height);
      }
    }
    const { head, carLength, gap, count } = trainPosition(line, town.width, game.time);
    const h = (carLength * artwork.metro.height) / artwork.metro.width;
    for (let i = 0; i < count; i++) {
      const x = head - carLength - i * (carLength + gap);
      if (x + carLength < ox || x > ox + game.vw) continue;
      g.drawImage(artwork.metro, x, y + 1.5 - h, carLength, h);
    }
  }
}
