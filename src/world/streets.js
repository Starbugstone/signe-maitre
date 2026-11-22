import { canvas, g, rect } from "../platform/canvas.js";
import { town, canalRow, CELL_H, CELL_W, X, Y } from "./town.js";
import { artwork, game } from "../core/state.js";
import { kerbX, kerbY, plateRegistration, streetProps } from "./street-props.js";
import { paintings, riverPlate } from "./paintings.js";

const plateScale = 5;
const plates = {},
  joins = new Map();
let roadPaint;

function paintCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.round(w * plateScale);
  c.height = Math.round(h * plateScale);
  return c;
}
function registerPlate(image, xs, ys, xt, yt) {
  const c = paintCanvas(xt.at(-1), yt.at(-1)),
    ctx = c.getContext("2d", { willReadFrequently: true });
  for (let j = 0; j < ys.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const [x, x2] = xt.slice(i, i + 2).map((n) => Math.round(n * plateScale));
      const [y, y2] = yt.slice(j, j + 2).map((n) => Math.round(n * plateScale));
      ctx.drawImage(image, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j], x, y, x2 - x, y2 - y);
    }
  return c;
}
function paintPattern(image, x, y, w, h, scale, shade) {
  const tile = document.createElement("canvas");
  tile.width = w;
  tile.height = h;
  const ctx = tile.getContext("2d");
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  if (shade) rect(ctx, 0, 0, w, h, shade);
  const pattern = g.createPattern(tile, "repeat");
  pattern.setTransform(new DOMMatrix().scale(scale));
  return pattern;
}

// Lift just the pale paint from the old lane dashes. The surrounding wet reflections supply the asphalt.
function clearMarkings(plate, across, mark, reach, exclude) {
  const ctx = plate.getContext("2d"),
    w = plate.width,
    h = plate.height;
  const band = Math.round(reach * plateScale),
    mid = Math.round(mark * plateScale);
  const span = across ? w : h;
  const x = across ? 0 : mid - band,
    y = across ? mid - band : 0;
  const bw = across ? w : band * 2 + 1,
    bh = across ? band * 2 + 1 : h;
  const slice = ctx.getImageData(x, y, bw, bh),
    pixels = slice.data;
  const index = (u, v) => (across ? v * bw + u : u * bw + v) * 4;
  for (let u = 0; u < span; u++) {
    if (Math.abs(u - span / 2) < exclude * plateScale) continue;
    const a = index(u, 0),
      b = index(u, band * 2);
    for (let v = 1; v < band * 2; v++) {
      const d = index(u, v),
        weight = 1 - Math.abs(v - band) / band;
      const paint = Math.min(1, Math.max(0, (pixels[d + 1] - 69) / 27));
      for (let k = 0; k < 3; k++) {
        const asphaltPx = pixels[a + k] + ((pixels[b + k] - pixels[a + k]) * v) / (band * 2);
        pixels[d + k] += (asphaltPx - pixels[d + k]) * paint * Math.min(1, weight * 3);
      }
    }
  }
  ctx.putImageData(slice, x, y);
}

function getJoin(key, a, b, across, start, length, r, bStart = 0) {
  if (joins.has(key)) return joins.get(key);
  const sw = across ? r : length,
    sh = across ? length : r;
  const joined = paintCanvas(across ? sw * 2 : sw, across ? sh : sh * 2),
    ctx = joined.getContext("2d");
  const other = paintCanvas(across ? sw * 2 : sw, across ? sh : sh * 2),
    overlay = other.getContext("2d");
  const w = joined.width,
    h = joined.height,
    half = (across ? w : h) / 2,
    s = Math.round(start * plateScale);
  const startB = Math.round(bStart * plateScale);
  function copy(c, img, second) {
    const source = second ? startB : (across ? img.width : img.height) - half;
    const args = across ? [source, s, half, h] : [s, source, w, half];
    const dx = across && second ? half : 0,
      dy = !across && second ? half : 0;
    c.drawImage(img, ...args, dx, dy, across ? half : w, across ? h : half);
    c.save();
    if (across) {
      c.translate(w, 0);
      c.scale(-1, 1);
    } else {
      c.translate(0, h);
      c.scale(1, -1);
    }
    c.drawImage(img, ...args, dx, dy, across ? half : w, across ? h : half);
    c.restore();
  }
  copy(ctx, a, false);
  copy(overlay, b, true);
  const mask = overlay.createLinearGradient(0, 0, across ? w : 0, across ? 0 : h);
  for (const [at, alpha] of [
    [0, 0],
    [0.18, 0.07],
    [0.5, 0.5],
    [0.82, 0.93],
    [1, 1],
  ])
    mask.addColorStop(at, "rgba(0,0,0," + alpha + ")");
  overlay.globalCompositeOperation = "destination-in";
  rect(overlay, 0, 0, w, h, mask);
  ctx.drawImage(other, 0, 0);
  joins.set(key, joined);
  return joined;
}

function markLane(ctx, x, y, vertical, start, end, spacing, size, double = false) {
  for (let d = start; d + size <= end + 0.01; d += spacing) {
    const salt = Math.sin((x + y + d) * 58.97);
    if (vertical) {
      if (double) {
        rect(ctx, x - 1.0, y + d, 0.55, size, roadPaint);
        rect(ctx, x + 0.45, y + d, 0.55, size, roadPaint);
      } else {
        rect(ctx, x - 0.4, y + d, 0.8, size, roadPaint);
        rect(ctx, x - 0.37, y + d + (salt + 1) * size * 0.36, 0.76, 0.45, "#34283c90");
      }
    } else {
      if (double) {
        rect(ctx, x + d, y - 1.05, size, 0.58, roadPaint);
        rect(ctx, x + d, y + 0.47, size, 0.58, roadPaint);
      } else {
        rect(ctx, x + d, y - 0.44, size, 0.88, roadPaint);
        rect(ctx, x + d + (salt + 1) * size * 0.34, y - 0.44, 0.58, 0.86, "#38283790");
      }
    }
  }
}

// The first four paintings are registered to their kerbs here. Every later painting is baked
// onto the plate grid by tools/art/bake-scenery.mjs and is drawn as decoded.
function prepareTown() {
  for (const [key, [xx, yy]] of Object.entries(plateRegistration)) {
    if (!artwork[key]) continue;
    const xs = [0, ...xx, 1500],
      ys = [0, ...yy, 1000];
    const xt = [0, CELL_W / 2 - kerbX, CELL_W / 2, CELL_W / 2 + kerbX, CELL_W];
    const yt = [0, CELL_H / 2 - kerbY, CELL_H / 2, CELL_H / 2 + kerbY, CELL_H];
    const plate = registerPlate(artwork[key], xs, ys, xt, yt);
    clearMarkings(plate, true, CELL_H / 2, 2.4, 41);
    clearMarkings(plate, false, CELL_W / 2, 2.45, 35);
    plates[key] = plate;
  }
  for (const key of [...Object.keys(paintings), "alleyStripV", "alleyStripH", "towerIron"])
    if (!plates[key] && artwork[key]) plates[key] = artwork[key];
  roadPaint = paintPattern(artwork.market, 32, 498, 39, 4, 0.2, "#80627362");
}

function cellPlateKey(col, row) {
  const kind = town.cellKinds?.[row]?.[col];
  return kind && plates[kind] ? kind : town.blocks[row][col];
}

// Which road leaves the intersection on each side: "wide", "alley" or none.
function cellArms(col, row) {
  const meta = town.cellMeta(col, row),
    arms = {};
  for (const dir of "nesw") arms[dir] = meta.allArms[dir] === "alley" ? "alley" : meta.wideArms[dir] ? "wide" : null;
  return arms;
}

// Copy part of a plate, given in world units from its cell centre, to world coordinates.
function blit(ctx, plate, left, top, w, h, dx, dy, dw = w, dh = h) {
  ctx.drawImage(
    plate,
    (left + CELL_W / 2) * plateScale,
    (top + CELL_H / 2) * plateScale,
    w * plateScale,
    h * plateScale,
    dx,
    dy,
    dw,
    dh,
  );
}

// A painting shows four road arms. Where the road graph has none, the block closes over the
// arm with a stretch of the painting's own frontage: the kerb and pavement run on unbroken.
const capHalf = 25.6;
function drawArmCaps(ctx, col, row) {
  const key = cellPlateKey(col, row),
    painting = paintings[key];
  if (!painting?.arms) return;
  const plate = plates[key],
    cx = X(col),
    cy = Y(row),
    arms = cellArms(col, row);
  const shows = (dir) => painting.arms.includes(dir);
  // North and south: a slice from the middle of a neighbouring block, moved along the street.
  const slice = (col + row) % 2 ? 74 : -74;
  if (!arms.n && shows("n") && row !== town.riverSouthRow)
    blit(ctx, plate, 74 - capHalf, -CELL_H / 2, 2 * capHalf, CELL_H / 2 - 16.3, cx - capHalf, cy - CELL_H / 2);
  if (!arms.s && shows("s"))
    blit(ctx, plate, slice - capHalf, 16.3, 2 * capHalf, CELL_H / 2 - 16.3, cx - capHalf, cy + 16.3);
  // East and west: the block to the south, with its pavement on the cross street, moved up
  // across the roadway. Its roof stands in front of the shopfronts behind, as roofs do.
  const from = painting.capFrom ?? 46,
    depth = CELL_H / 2 - from;
  if (!arms.e && shows("e")) blit(ctx, plate, 17.1, from, CELL_W / 2 - 17.1, depth, cx + 17.1, cy + 26 - depth);
  if (!arms.w && shows("w")) blit(ctx, plate, -CELL_W / 2, from, CELL_W / 2 - 17.1, depth, cx - CELL_W / 2, cy + 26 - depth);
}

// Painted ruelle strips. Both repeat along their length, one cell per repeat.
const stripV = { width: 43.2, lane: 21.72 },
  stripH = { height: 47.2, lane: 23.42 };
// A north-south strip with its lane on x, from y0 to y1. `fit` widens it to a road corridor.
function alleyV(ctx, x, y0, y1, fit = 1) {
  if (y1 <= y0) return;
  const top = Y(town.cellAt(x, (y0 + y1) / 2).row) - CELL_H / 2;
  ctx.drawImage(
    plates.alleyStripV,
    0,
    (y0 - top) * plateScale,
    stripV.width * plateScale,
    (y1 - y0) * plateScale,
    x - stripV.lane * fit,
    y0,
    stripV.width * fit,
    y1 - y0 + 0.03,
  );
}
function alleyH(ctx, y, x0, x1, fit = 1) {
  if (x1 <= x0) return;
  const left = X(town.cellAt((x0 + x1) / 2, y).col) - CELL_W / 2;
  ctx.drawImage(
    plates.alleyStripH,
    (x0 - left) * plateScale,
    0,
    (x1 - x0) * plateScale,
    stripH.height * plateScale,
    x0,
    y - stripH.lane * fit,
    x1 - x0 + 0.03,
    stripH.height * fit,
  );
}
const corridorV = 1.16,
  corridorH = 1.13;

// A ruelle where the painting shows a full street: the strip fills the corridor between the
// building lines, from the junction's corner pavements out to the cell edge.
function drawAlleyArms(ctx, col, row) {
  const painting = paintings[cellPlateKey(col, row)];
  if (!painting?.arms) return;
  const arms = cellArms(col, row),
    cx = X(col),
    cy = Y(row);
  const lane = (dir) => arms[dir] === "alley" && !painting.alleys?.includes(dir);
  const forecourt = painting.forecourt?.w ?? 25;
  if (lane("n")) alleyV(ctx, cx, cy - CELL_H / 2, cy - 28, corridorV);
  if (lane("s")) alleyV(ctx, cx, cy + 23, cy + CELL_H / 2, corridorV);
  if (lane("w")) alleyH(ctx, cy, cx - CELL_W / 2, cx - forecourt, corridorH);
  if (lane("e")) alleyH(ctx, cy, cx + 25, cx + CELL_W / 2, corridorH);
}

// Every cell seam is a back lane between two paintings: a painted strip covers the join,
// stopping at the pavements of each street it meets.
function drawSeams(ctx, firstCol, lastCol, firstRow, lastRow, visible) {
  const land = (row) => row >= 0 && row < town.rows && row !== town.riverRow;
  for (let row = Math.max(0, firstRow); row <= lastRow; row++) {
    if (!land(row)) continue;
    const cy = Y(row);
    // The river plate covers the quay rows from 27 units south of Quai Nord to the Quai Sud kerb.
    const top = row === town.riverSouthRow ? -16 : -CELL_H / 2,
      bottom = row === canalRow ? 28 : CELL_H / 2;
    for (let col = Math.max(1, firstCol); col <= lastCol; col++) {
      const x = X(col) - CELL_W / 2;
      if (!visible(x - 24, cy - CELL_H / 2, 48, CELL_H)) continue;
      const crossed = cellArms(col - 1, row).e || cellArms(col, row).w;
      if (crossed) {
        alleyV(ctx, x, cy + top, cy - 28);
        alleyV(ctx, x, cy + 23, cy + bottom);
      } else alleyV(ctx, x, cy + top, cy + bottom);
    }
  }
  for (let row = Math.max(1, firstRow); row <= lastRow; row++) {
    if (!land(row) || !land(row - 1)) continue;
    const y = Y(row) - CELL_H / 2;
    for (let col = Math.max(0, firstCol); col <= lastCol; col++) {
      const cx = X(col);
      if (!visible(cx - CELL_W / 2, y - 26, CELL_W, 52)) continue;
      const crossed = cellArms(col, row - 1).s || cellArms(col, row).n;
      if (crossed) {
        alleyH(ctx, y, cx - CELL_W / 2, cx - 25);
        alleyH(ctx, y, cx + 25, cx + CELL_W / 2);
      } else alleyH(ctx, y, cx - CELL_W / 2, cx + CELL_W / 2);
    }
    // Where two lanes cross, the centre of the alley-crossing painting.
    for (let col = Math.max(1, firstCol); col <= lastCol; col++) {
      const x = X(col) - CELL_W / 2;
      if (visible(x - 24, y - 26, 48, 52))
        blit(ctx, plates.alleyCross, -stripV.lane, -stripH.lane, stripV.width, stripH.height, x - stripV.lane, y - stripH.lane);
    }
  }
}

// Soften the meeting of two paintings across a road and its pavements.
function drawRoadJoins(ctx, firstCol, lastCol, firstRow, lastRow, visible) {
  for (let row = Math.max(0, firstRow); row <= lastRow; row++) {
    if (row === town.riverRow) continue;
    for (let col = Math.max(1, firstCol); col <= lastCol; col++) {
      const x = X(col) - CELL_W / 2,
        y = Y(row);
      if (!visible(x - 14, y - 30, 28, 58)) continue;
      if (cellArms(col - 1, row).e !== "wide" || cellArms(col, row).w !== "wide") continue;
      const l = cellPlateKey(col - 1, row),
        r = cellPlateKey(col, row);
      // On the quays only the part outside the river plate is joined.
      const top = row === town.riverSouthRow ? 16 : 29,
        bottom = row === canalRow ? 26 : 27;
      const road = getJoin("road:" + l + r + top + bottom, plates[l], plates[r], true, CELL_H / 2 - top, top + bottom, 14);
      ctx.drawImage(road, x - 14, y - top, 28, top + bottom);
    }
  }
  for (let row = Math.max(1, firstRow); row <= lastRow; row++) {
    if (row === town.riverRow || row - 1 === town.riverRow) continue;
    for (let col = Math.max(0, firstCol); col <= lastCol; col++) {
      const x = X(col),
        y = Y(row) - CELL_H / 2;
      if (!visible(x - 27, y - 12, 54, 24)) continue;
      if (cellArms(col, row - 1).s !== "wide" || cellArms(col, row).n !== "wide") continue;
      const n = cellPlateKey(col, row - 1),
        s = cellPlateKey(col, row);
      const road = getJoin("cross:" + n + s, plates[n], plates[s], false, CELL_W / 2 - 26.5, 53, 12);
      ctx.drawImage(road, x - 26.5, y - 12, 53, 24);
    }
  }
}

function trace(ctx, polygon, dx = 0, dy = 0) {
  ctx.moveTo(polygon[0][0] + dx, polygon[0][1] + dy);
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0] + dx, polygon[i][1] + dy);
  ctx.closePath();
}

// La Ferre: one plate per column from the north quay cap to the Quai Sud kerb, over the
// quay halves of the two bank rows.
function drawRiver(ctx, firstCol, lastCol, visible) {
  const top = Y(town.riverRow) + riverPlate.top;
  for (let col = Math.max(0, firstCol); col <= lastCol; col++) {
    const left = X(col) - CELL_W / 2;
    if (!visible(left, top, CELL_W, riverPlate.height)) continue;
    ctx.drawImage(plates[cellPlateKey(col, town.riverRow)], left, top, CELL_W + 0.03, riverPlate.height + 0.03);
    // Tour de Fer's rear shoes and their gardens stand on the quay, in front of the water.
    const south = cellPlateKey(col, town.riverSouthRow),
      gardens = paintings[south]?.gardens;
    if (gardens) {
      const cx = X(col),
        cy = Y(town.riverSouthRow);
      ctx.save();
      ctx.beginPath();
      for (const garden of gardens) trace(ctx, garden, cx, cy);
      ctx.clip();
      ctx.drawImage(plates[south], left, cy - CELL_H / 2, CELL_W, CELL_H);
      ctx.restore();
    }
  }
}

function drawLaneMarks(ctx, visible) {
  for (const edge of town.roads.edges) {
    if (edge.class === "alley") continue;
    const na = town.roadNodeById.get(edge.a),
      nb = town.roadNodeById.get(edge.b);
    const horiz = Math.abs(na.y - nb.y) < 1;
    const dbl = edge.class === "avenue";
    if (horiz) {
      const leftN = na.x < nb.x ? na : nb,
        rightN = na.x < nb.x ? nb : na;
      const startOff = leftN.kind === "roundabout" ? leftN.outerRadius + 10 : 48;
      const endOff = rightN.kind === "roundabout" ? rightN.outerRadius + 10 : 48;
      const span = rightN.x - leftN.x;
      if (span > startOff + endOff && visible(leftN.x + startOff, leftN.y - 2, span - startOff - endOff, 4))
        markLane(ctx, leftN.x, leftN.y, false, startOff, span - endOff, 19, 10, dbl);
    } else {
      const topN = na.y < nb.y ? na : nb,
        botN = na.y < nb.y ? nb : na;
      const startOff = topN.kind === "roundabout" ? topN.outerRadius + 10 : 36;
      const endOff = botN.kind === "roundabout" ? botN.outerRadius + 10 : 36;
      const span = botN.y - topN.y;
      if (span > startOff + endOff && visible(topN.x - 2, topN.y + startOff, 4, span - startOff - endOff))
        markLane(ctx, topN.x, topN.y, true, startOff, span - endOff, 19, 10, dbl);
    }
  }
}

function drawTown(ox, oy, ctx, width, height) {
  const { firstCol, lastCol, firstRow, lastRow } = town.visibleCells(ox, oy, width, height, CELL_W / 2);
  const endX = ox + width + 1,
    endY = oy + height + 1;
  const visible = (x, y, w, h) => x + w >= ox && x <= endX && y + h >= oy && y <= endY;
  const cells = [];
  for (let row = Math.max(0, firstRow); row <= lastRow; row++) {
    if (row === town.riverRow) continue;
    for (let col = Math.max(0, firstCol); col <= lastCol; col++)
      if (visible(X(col) - CELL_W / 2, Y(row) - CELL_H / 2, CELL_W, CELL_H)) cells.push([col, row]);
  }
  for (const [col, row] of cells)
    ctx.drawImage(plates[cellPlateKey(col, row)], X(col) - CELL_W / 2, Y(row) - CELL_H / 2, CELL_W + 0.03, CELL_H + 0.03);
  for (const [col, row] of cells) drawArmCaps(ctx, col, row);
  drawRoadJoins(ctx, firstCol, lastCol, firstRow, lastRow, visible);
  for (const [col, row] of cells) drawAlleyArms(ctx, col, row);
  drawSeams(ctx, firstCol, lastCol, firstRow, lastRow, visible);
  if (lastRow >= canalRow && firstRow <= town.riverSouthRow) drawRiver(ctx, firstCol, lastCol, visible);
  drawLaneMarks(ctx, visible);
}

// Ironwork that passes over the street is drawn after everyone beneath it.
export function drawOverheadMonuments(ctx, ox, oy) {
  const area = town.visibleCells(ox, oy, game.vw, game.vh, CELL_W / 2);
  for (let row = area.firstRow; row <= area.lastRow; row++)
    for (let col = area.firstCol; col <= area.lastCol; col++) {
      if (cellPlateKey(col, row) !== "towerBase") continue;
      const iron = plates.towerIron;
      ctx.drawImage(iron, X(col) - CELL_W / 2, Y(row) - CELL_H / 2, CELL_W, iron.height / plateScale);
    }
}

// Cut foreground objects from the registered plate once. Only their painted
// silhouettes cover actors standing behind them.
const propSprites = new WeakMap();
export function drawStreetProp({ x, y, item }) {
  let sprite = propSprites.get(item);
  if (!sprite) {
    const xs = item.outline.map((p) => p[0]),
      ys = item.outline.map((p) => p[1]);
    const left = Math.floor(Math.min(...xs) * plateScale) / plateScale,
      top = Math.floor(Math.min(...ys) * plateScale) / plateScale;
    const w = Math.ceil((Math.max(...xs) - left + 0.2) * plateScale),
      h = Math.ceil((Math.max(item.y, ...ys) - top) * plateScale);
    const image = document.createElement("canvas");
    image.width = w;
    image.height = h;
    const ctx = image.getContext("2d");
    ctx.setTransform(plateScale, 0, 0, plateScale, -left * plateScale, -top * plateScale);
    ctx.beginPath();
    for (const [px, py] of item.outline) ctx.lineTo(px, py);
    ctx.closePath();
    ctx.clip();
    const plate = plates[item.key];
    ctx.drawImage(
      plate,
      -CELL_W / 2,
      item.key === "canal" ? 16 : -CELL_H / 2,
      plate.width / plateScale,
      plate.height / plateScale,
    );
    sprite = { image, dx: left - item.x, dy: top - item.y };
    propSprites.set(item, sprite);
  }
  g.drawImage(
    sprite.image,
    x + sprite.dx,
    y + sprite.dy,
    sprite.image.width / plateScale,
    sprite.image.height / plateScale,
  );
}

export function visibleStreetProps(ox, oy) {
  const area = town.visibleCells(ox, oy, game.vw, game.vh + 52);
  const result = [];
  for (let row = area.firstRow; row <= area.lastRow; row++)
    for (let col = area.firstCol; col <= area.lastCol; col++)
      for (const prop of streetProps(town, col, row))
        if (prop.x >= ox - 3 && prop.x <= ox + game.vw + 3 && prop.y >= oy && prop.y <= oy + game.vh + 52)
          result.push(prop);
  return result;
}

const streets = document.createElement("canvas");
const streetContext = streets.getContext("2d", { alpha: false });
let cachedX = Infinity,
  cachedY = Infinity,
  groundScale = 0;

function streetLayer(ox, oy) {
  const scale = canvas.width / game.vw,
    margin = 30,
    width = game.vw + 2 * margin,
    height = game.vh + 2 * margin;
  if (
    groundScale !== scale ||
    ox < cachedX ||
    oy < cachedY ||
    ox + game.vw > cachedX + streets.width / scale ||
    oy + game.vh > cachedY + streets.height / scale
  ) {
    groundScale = scale;
    cachedX = ox - margin;
    cachedY = oy - margin;
    const w = Math.ceil(width * scale),
      h = Math.ceil(height * scale);
    if (streets.width !== w || streets.height !== h) {
      streets.width = w;
      streets.height = h;
    }
    streetContext.setTransform(scale, 0, 0, scale, -cachedX * scale, -cachedY * scale);
    rect(streetContext, cachedX, cachedY, width, height, "#201c29");
    drawTown(cachedX, cachedY, streetContext, width, height);
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(streets, Math.round((cachedX - ox) * scale), Math.round((cachedY - oy) * scale));
  g.restore();
}

// Restore the painted decks and island where they occlude hulls, reflections and wakes.
export function drawBridgeDecks(ox, oy) {
  const row = town.riverRow,
    cy = Y(row);
  const { firstCol, lastCol } = town.visibleCells(ox, oy, game.vw, game.vh, CELL_W / 2);
  g.save();
  g.beginPath();
  for (let col = Math.max(0, firstCol - 1); col <= Math.min(town.cols - 1, lastCol + 1); col++) {
    const painting = paintings[cellPlateKey(col, row)],
      cx = X(col);
    if (painting.deck) trace(g, painting.deck, cx, cy);
    for (const deck of painting.decks || []) trace(g, deck, cx, cy);
  }
  // The island's quay wall, as painted; wound like the decks so that overlaps stay filled.
  const west = town.cellKinds[row].indexOf("islandWest"),
    east = town.cellKinds[row].indexOf("islandEast");
  if (west >= 0 && east >= 0) {
    const wall = [
      ...paintings.islandWest.outline.map(([x, y]) => [X(west) + x, cy + y]),
      ...paintings.islandEast.outline.map(([x, y]) => [X(east) + x, cy + y]),
    ];
    trace(g, wall.reverse());
  }
  g.clip("nonzero");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(streets, Math.round((cachedX - ox) * groundScale), Math.round((cachedY - oy) * groundScale));
  g.restore();
}

export { plateScale, plates, prepareTown, streetLayer };
