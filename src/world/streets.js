import { canvas, g, rect } from "../platform/canvas.js";
import { town, canalRow, CELL_H, CELL_W, W, X, Y, canalBottom, canalTop, city } from "./town.js";
import { artwork, game } from "../core/state.js";

const plateScale = 5,
  kerbX = 17.6,
  kerbY = 16.8;
const plates = {},
  northApproaches = {},
  joins = new Map();
let setts, wall, slate, roadPaint, edgeStone;

// Source control points register the centre lines and straight kerbs of each painting.
const plateRegistration = {
  market: [
    [667, 749, 841],
    [429, 500, 559],
  ],
  garage: [
    [668, 750, 838],
    [430, 503, 575],
  ],
  docks: [
    [667, 751, 842],
    [429, 499, 573],
  ],
  square: [
    [669, 749, 840],
    [429, 499, 572],
  ],
};
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
        const asphalt = pixels[a + k] + ((pixels[b + k] - pixels[a + k]) * v) / (band * 2);
        pixels[d + k] += (asphalt - pixels[d + k]) * paint * Math.min(1, weight * 3);
      }
    }
  }
  ctx.putImageData(slice, x, y);
}
function prepareTown() {
  for (const [key, [xx, yy]] of Object.entries(plateRegistration)) {
    const xs = [0, ...xx, 1500],
      ys = [0, ...yy, 1000];
    const xt = [0, CELL_W / 2 - kerbX, CELL_W / 2, CELL_W / 2 + kerbX, CELL_W];
    const yt = [0, CELL_H / 2 - kerbY, CELL_H / 2, CELL_H / 2 + kerbY, CELL_H];
    const plate = registerPlate(artwork[key], xs, ys, xt, yt);
    clearMarkings(plate, true, CELL_H / 2, 2.4, 41);
    clearMarkings(plate, false, CELL_W / 2, 2.45, 35);
    plates[key] = plate;
    northApproaches[key] = paintNorthApproach(plate);
  }
  const ht = canalBottom - canalTop + 5;
  plates.canal = registerPlate(
    artwork.canal,
    [0, 700, 769, 834, 1536],
    [10, 65, 389, 456, 467],
    [0, 132, 145, 158, 290],
    [0, 27, ht - 28, ht - 4, ht],
  );
  clearMarkings(plates.canal, false, CELL_W / 2, 2.4, 0);
  setts = paintPattern(artwork.market, 1080, 372, 76, 30, 0.2, "#21192b58");
  wall = paintPattern(artwork.market, 539, 682, 34, 40, 0.2, "#23182763");
  slate = paintPattern(artwork.square, 73, 3, 47, 53, 0.2, "#231d339d");
  edgeStone = paintPattern(artwork.market, 36, 415, 179, 7, 0.2, "#724e4d2e");
  // Sample the mottled straight paint, including the coarse aggregate showing through it.
  roadPaint = paintPattern(artwork.market, 32, 498, 39, 4, 0.2, "#80627362");
}
function paintNorthApproach(plate) {
  const approach = paintCanvas(CELL_W, 26),
    ctx = approach.getContext("2d");
  const mid = (CELL_H / 2) * plateScale,
    w = approach.width,
    h = approach.height;
  ctx.save();
  ctx.translate(0, h);
  ctx.scale(1, -1);
  ctx.drawImage(plate, 0, mid - h, w, h, 0, 0, w, h);
  ctx.restore();
  // The straight bridge entrance needs asphalt where the reflected street had a zebra crossing.
  const open = Math.round(13 * plateScale),
    depth = 5 * plateScale;
  ctx.drawImage(
    plate,
    w / 2 - open,
    mid - 17 * plateScale,
    2 * open,
    depth,
    w / 2 - open,
    h - depth,
    2 * open,
    depth,
  );
  const fade = ctx.createLinearGradient(0, 0, 0, 8 * plateScale);
  fade.addColorStop(0, "#0000");
  fade.addColorStop(0.35, "#0002");
  fade.addColorStop(1, "#000");
  ctx.globalCompositeOperation = "destination-in";
  rect(ctx, 0, 0, w, h, fade);
  return approach;
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
function shape(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
const eaves = {
  market: [-69, -70, 49, 55],
  garage: [-82, -66, 44, 53],
  docks: [-83, -82, 49, 48],
  square: [-90, -76, 53, 46],
};
function sideAlley(ctx, x, y, left, right, south) {
  // End the buildings at their own eaves, leaving the setts visible at street level.
  const start = south ? 18 : -CELL_H / 2,
    end = south ? CELL_H / 2 : -kerbY - 0.5;
  const lEave = eaves[left][south ? 3 : 1],
    rEave = eaves[right][south ? 2 : 0];
  const lFoot = south ? 111 : -28,
    rFoot = south ? 110 : -27;
  const leftEdge = [
    [x - 3.6, y + start],
    [x - 5.6, y + lEave - 3],
    [x - 4.15, y + lEave],
    [x - 4.15, y + lFoot],
    [x - 3.5, y + end],
  ];
  const rightEdge = [
    [x + 3.3, y + start],
    [x + 5.3, y + rEave - 2],
    [x + 4.05, y + rEave],
    [x + 4.05, y + rFoot],
    [x + 3.4, y + end],
  ];
  shape(ctx, [...leftEdge, ...rightEdge.slice().reverse()], setts);
  const shadow = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
  shadow.addColorStop(0, "#201524ce");
  shadow.addColorStop(0.35, "#25192a4f");
  shadow.addColorStop(0.72, "#21192c5c");
  shadow.addColorStop(1, "#201625b9");
  shape(ctx, [...leftEdge, ...rightEdge.slice().reverse()], shadow);
  for (const [edge, side, eave, foot] of [
    [leftEdge, -1, lEave, lFoot],
    [rightEdge, 1, rEave, rFoot],
  ]) {
    const inner = x + side * 1.7;
    const roof = [edge[0], edge[1], edge[2], [inner, y + eave + 2.3], [inner, y + start]];
    shape(ctx, roof, slate);
    shape(ctx, [edge[2], edge[3], [inner, y + foot + 1.4], [inner, y + eave + 2.3]], wall);
    if (side === 1)
      shape(ctx, [edge[2], edge[3], [inner, y + foot + 1.4], [inner, y + eave + 2.3]], "#18142153");
    ctx.strokeStyle = side === -1 ? "#977b78ad" : "#191323db";
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.moveTo(...edge[1]);
    ctx.lineTo(...edge[2]);
    ctx.lineTo(inner, y + eave + 2.3);
    ctx.stroke();
    const drain = edge[2][0] - side * 0.3;
    rect(ctx, drain - 0.23, y + eave + 0.25, 0.73, foot - eave + 0.2, "#211722");
    rect(ctx, drain, y + eave + 0.25, 0.25, foot - eave + 0.2, "#8d685f");
    for (let dy = eave + 11; dy < foot; dy += 17) rect(ctx, drain - 0.24, y + dy, 0.7, 0.37, "#c28d71");
  }
}
function backLane(ctx, x, y) {
  for (const side of [-1, 1]) {
    const a = x + side * (kerbX + 4.6),
      b = x + (side * CELL_W) / 2;
    const tip = x + side * (kerbX + 9);
    const edge = [
      [b, y - 0.2],
      [a, y - 0.2],
      [tip, y + 3.2],
      [b, y + 3.95],
    ];
    shape(ctx, edge, setts);
    const shadow = ctx.createLinearGradient(0, y - 0.3, 0, y + 7);
    shadow.addColorStop(0, "#21182a12");
    shadow.addColorStop(0.5, "#21182ac0");
    shadow.addColorStop(1, "#21182a00");
    shape(
      ctx,
      [
        [b, y - 0.3],
        [a, y - 0.3],
        [tip, y + 6.7],
        [b, y + 7],
      ],
      shadow,
    );
    ctx.strokeStyle = "#8c7a746b";
    ctx.lineWidth = 0.43;
    ctx.beginPath();
    ctx.moveTo(b, y + 3.95);
    ctx.lineTo(tip, y + 3.2);
    ctx.stroke();
  }
}
function markLane(ctx, x, y, vertical, start, end, spacing, size) {
  for (let d = start; d + size <= end + 0.01; d += spacing) {
    const salt = Math.sin((x + y + d) * 58.97);
    if (vertical) {
      rect(ctx, x - 0.4, y + d, 0.8, size, roadPaint);
      rect(ctx, x - 0.37, y + d + (salt + 1) * size * 0.36, 0.76, 0.45, "#34283c90");
    } else {
      rect(ctx, x + d, y - 0.44, size, 0.88, roadPaint);
      rect(ctx, x + d + (salt + 1) * size * 0.34, y - 0.44, 0.58, 0.86, "#38283790");
    }
  }
}
function drawTown(ox, oy, ctx, width, height) {
  const { firstCol, lastCol, firstRow, lastRow } = town.visibleCells(ox, oy, width, height, CELL_W / 2);
  const endX = ox + width + 1,
    endY = oy + height + 1;
  const visible = (x, y, w, h) => x + w >= ox && x <= endX && y + h >= oy && y <= endY;
  for (let j = Math.max(0, firstRow); j <= lastRow; j++)
    for (let i = Math.max(0, firstCol); i <= lastCol; i++) {
      const x = X(i) - CELL_W / 2,
        y = Y(j) - CELL_H / 2;
      if (visible(x, y, CELL_W, CELL_H))
        ctx.drawImage(plates[city[j][i]], x, y, CELL_W + 0.03, CELL_H + 0.03);
    }
  for (let j = Math.max(0, firstRow); j <= lastRow; j++)
    for (let i = Math.max(1, firstCol); i <= lastCol; i++) {
      const x = X(i) - CELL_W / 2,
        y = Y(j),
        l = city[j][i - 1],
        r = city[j][i];
      if (!visible(x - 14, y - CELL_H / 2, 28, CELL_H)) continue;
      const road = getJoin("road:" + l + r, plates[l], plates[r], true, CELL_H / 2 - 21, 42, 14);
      ctx.drawImage(road, x - 14, y - 21, 28, 42);
      sideAlley(ctx, x, y, l, r, false);
      sideAlley(ctx, x, y, l, r, true);
    }
  for (let j = Math.max(1, firstRow); j <= lastRow; j++)
    for (let i = Math.max(0, firstCol); i <= lastCol; i++) {
      if (j === canalRow + 1) continue;
      const x = X(i),
        y = Y(j) - CELL_H / 2,
        n = city[j - 1][i],
        s = city[j][i];
      if (!visible(x - CELL_W / 2, y - 12, CELL_W, 24)) continue;
      const road = getJoin(
        "cross:" + n + s,
        plates[n],
        plates[s],
        false,
        CELL_W / 2 - kerbX - 5,
        2 * (kerbX + 5),
        12,
      );
      ctx.drawImage(road, x - kerbX - 5, y - 12, 2 * (kerbX + 5), 24);
      backLane(ctx, x, y);
    }
  if (visible(0, canalTop - 5, W, canalBottom - canalTop + 11)) drawCanal(ctx, visible, firstCol, lastCol);
  for (let j = Math.max(0, firstRow); j <= lastRow; j++)
    for (let i = Math.max(0, firstCol); i <= lastCol; i++) {
      const x = X(i),
        y = Y(j);
      if (visible(x + 50, y - 1, CELL_W - 100, 2)) markLane(ctx, x, y, false, 55, 235, 19, 10);
      if (j !== canalRow && visible(x - 1, y + 34, 2, CELL_H - 68))
        markLane(ctx, x, y, true, 36, 191, 19, 10);
      if (j === 0 && visible(x - 1, 0, 2, y - 34)) markLane(ctx, x, 0, true, 5, y - 34, 19, 10);
      if (j === canalRow && visible(x - 1, y + 29, 2, CELL_H - 58))
        markLane(ctx, x, y, true, 30, 198, 19, 10);
    }
}
function northQuayPath(ctx, x, top, side) {
  const end = x + (side * CELL_W) / 2;
  ctx.moveTo(end, top);
  ctx.lineTo(x + side * 26, top);
  ctx.quadraticCurveTo(x + side * 14, top, x + side * 13, top + 10);
}
function drawCanal(ctx, visible, firstCol, lastCol) {
  const canal = plates.canal,
    top = canalTop,
    ht = canalBottom - canalTop + 5;
  const northRow = canalRow,
    southRow = canalRow + 1,
    remaining = ht - 10;
  for (let i = Math.max(0, firstCol); i <= lastCol; i++) {
    const x = X(i),
      left = x - CELL_W / 2,
      north = Y(northRow),
      south = Y(southRow);
    if (!visible(left, top - 10, CELL_W, ht + 13)) continue;
    const northKey = city[northRow][i],
      southKey = city[southRow][i];
    const approach = northApproaches[northKey],
      southPlate = plates[southKey];
    // The quay replaces the roofs that originally bordered the boulevard.
    // Reflect the opposite asphalt to carry the junction and crossings to the water's edge.
    ctx.drawImage(approach, left, north, CELL_W, 26);
    ctx.drawImage(
      canal,
      0,
      10 * plateScale,
      canal.width,
      remaining * plateScale,
      left,
      top + 10,
      CELL_W + 0.03,
      remaining,
    );
    for (const side of [-1, 1]) {
      const end = x + (side * CELL_W) / 2;
      ctx.save();
      ctx.beginPath();
      northQuayPath(ctx, x, top, side);
      ctx.lineTo(end, top + 10);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(canal, 0, 0, canal.width, 10 * plateScale, left, top, CELL_W + 0.03, 10.05);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      northQuayPath(ctx, x, top, side);
      ctx.strokeStyle = "#242031";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.strokeStyle = edgeStone;
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.restore();
    }
    const entry = getJoin(
      "bridge-entry:" + northKey,
      approach,
      canal,
      false,
      CELL_W / 2 - 12.6,
      25.2,
      3.6,
      10,
    );
    ctx.drawImage(entry, x - 12.6, top + 6.4, 25.2, 7.2);
    const exit = getJoin(
      "bridge-exit:" + southKey,
      canal,
      southPlate,
      false,
      0,
      CELL_W,
      3.9,
      CELL_H / 2 + top + ht - south,
    );
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left, top + ht - 3.9);
    ctx.lineTo(x - 31, top + ht - 3.9);
    ctx.lineTo(x - 23, top + ht);
    ctx.lineTo(x + 23, top + ht);
    ctx.lineTo(x + 31, top + ht - 3.9);
    ctx.lineTo(left + CELL_W, top + ht - 3.9);
    ctx.lineTo(left + CELL_W, top + ht + 3.9);
    ctx.lineTo(left, top + ht + 3.9);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(exit, left, top + ht - 3.9, CELL_W, 7.8);
    ctx.restore();
  }
  const seam = getJoin("canal", canal, canal, true, 0, ht, 10);
  for (let i = Math.max(1, firstCol); i <= lastCol; i++) {
    const x = X(i) - CELL_W / 2;
    if (!visible(x - 13, top - 9, 26, ht + 12)) continue;
    const l = city[canalRow][i - 1],
      r = city[canalRow][i];
    const waterRoad = getJoin("quayside:" + l + r, northApproaches[l], northApproaches[r], true, 0, 16, 13);
    ctx.drawImage(waterRoad, x - 13, Y(canalRow), 26, 16);
    ctx.drawImage(seam, 0, 1 * plateScale, seam.width, (ht - 4) * plateScale, x - 10, top + 1, 20, ht - 4);
  }
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

export { kerbY, plateScale, plates, prepareTown, streetLayer };
