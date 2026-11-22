import { canvas, g, rect } from "../platform/canvas.js";
import { town, canalRow, CELL_H, CELL_W, TAU, W, X, Y, city } from "./town.js";
import { artwork, game } from "../core/state.js";
import { kerbX, kerbY, plateRegistration, streetProps } from "./street-props.js";
import { roundaboutCircRadius } from "./routes.js";

const plateScale = 5;
const plates = {},
  northApproaches = {},
  joins = new Map();
let setts, wall, slate, roadPaint, edgeStone, asphalt;

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

// Extract reusable river water, north/south quay walls and bridge deck tiles from canal.webp.
function prepareRiverPlates() {
  const src = artwork.canal;
  // Pure open-water tile (stitch left and right water halves without the painted bridge).
  const waterTile = paintCanvas(CELL_W, 140);
  const wctx = waterTile.getContext("2d");
  const halfW = waterTile.width / 2;
  wctx.drawImage(src, 0, 68, 690, 316, 0, 0, halfW + 1, waterTile.height);
  wctx.drawImage(src, 846, 68, 690, 316, halfW, 0, halfW + 1, waterTile.height);
  plates.riverWater = waterTile;

  // North stone quay parapet strip (no bridge entrance).
  const northQuay = paintCanvas(CELL_W, 27);
  const nctx = northQuay.getContext("2d");
  nctx.drawImage(src, 0, 10, 690, 56, 0, 0, halfW + 1, northQuay.height);
  nctx.drawImage(src, 846, 10, 690, 56, halfW, 0, halfW + 1, northQuay.height);
  plates.northQuay = northQuay;

  // South stone quay wall & apron strip (no bridge exit).
  const southQuay = paintCanvas(CELL_W, 30);
  const sctx = southQuay.getContext("2d");
  sctx.drawImage(src, 0, 389, 690, 78, 0, 0, halfW + 1, southQuay.height);
  sctx.drawImage(src, 846, 389, 690, 78, halfW, 0, halfW + 1, southQuay.height);
  plates.southQuay = southQuay;

  // Registered bridge deck & parapets extracted from the centre of canal.webp.
  const bridge = registerPlate(
    src,
    [682, 700, 769, 834, 854],
    [10, 65, 389, 456, 467],
    [0, 6, 22, 38, 44],
    [0, 20, 124, 142, 148],
  );
  clearMarkings(bridge, false, 22, 2.2, 0);
  plates.riverBridge = bridge;
}

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
    northApproaches[key] = paintNorthApproach(plate);
  }
  prepareRiverPlates();
  setts = paintPattern(artwork.market, 1080, 372, 76, 30, 0.2, "#21192b58");
  wall = paintPattern(artwork.market, 539, 682, 34, 40, 0.2, "#23182763");
  slate = paintPattern(artwork.square, 73, 3, 47, 53, 0.2, "#231d339d");
  edgeStone = paintPattern(artwork.market, 36, 415, 179, 7, 0.2, "#724e4d2e");
  roadPaint = paintPattern(artwork.market, 32, 498, 39, 4, 0.2, "#80627362");
  asphalt = paintPattern(artwork.square, 680, 460, 58, 44, 0.22, "#211c2c52");
}

function cellPlateKey(col, row) {
  const kind = town.cellKinds?.[row]?.[col];
  if (kind && plates[kind]) return kind;
  return city[row][col];
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
  const start = south ? 18 : -CELL_H / 2,
    end = south ? CELL_H / 2 : -kerbY - 0.5;
  const lEave = (eaves[left] || eaves.square)[south ? 3 : 1],
    rEave = (eaves[right] || eaves.square)[south ? 2 : 0];
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

function drawAlleyMouth(ctx, x, y, left, right) {
  const key = "alley-mouth:" + left + right;
  let mouth = joins.get(key);
  if (!mouth) {
    mouth = getJoin(key, plates[left], plates[right], true, CELL_H / 2 - 27, 11, 6);
    const paint = mouth.getContext("2d");
    const fade = paint.createLinearGradient(0, 0, 0, mouth.height);
    fade.addColorStop(0, "transparent");
    fade.addColorStop(0.7, "black");
    paint.save();
    paint.globalCompositeOperation = "destination-in";
    paint.fillStyle = fade;
    paint.fillRect(0, 0, mouth.width, mouth.height);
    paint.restore();
  }
  ctx.drawImage(mouth, x - 6, y - 27, 12, 11);
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

// Cover unused road stubs at dead ends and tee junctions with matching Port-Fer slate roofs & stone walls.
function drawMissingArmCover(ctx, cx, cy, dir, isPark) {
  const fillRoof = isPark ? "#1c332a" : slate;
  const fillWall = isPark ? "#244035" : wall;
  const drawCover = (x, y, w, h) => {
    rect(ctx, x, y, w, h, fillRoof);
    ctx.strokeStyle = "#191322";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (isPark) {
      // Soft tree crowns & wrought iron edge.
      ctx.fillStyle = "#264638";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(x + (w * (i + 0.5)) / 4, y + h * 0.5, Math.min(w, h) * 0.35, 0, TAU);
        ctx.fill();
      }
    } else {
      rect(ctx, x + 1, y + h - 8, w - 2, 7, fillWall);
      rect(ctx, x + 2, y + h - 2, w - 4, 1.5, edgeStone);
    }
  };
  if (dir === "n") drawCover(cx - 28, cy - CELL_H / 2, 56, CELL_H / 2 - 28);
  else if (dir === "s") drawCover(cx - 28, cy + 23, 56, CELL_H / 2 - 23);
  else if (dir === "w") drawCover(cx - CELL_W / 2, cy - 28, CELL_W / 2 - 25, 51);
  else if (dir === "e") drawCover(cx + 25, cy - 28, CELL_W / 2 - 25, 51);
}

// Cobblestone alley paving (halfWidth = 7) with shadowed walls and mouth bollards blocking wide cars.
function drawAlleyOverlay(ctx, edge) {
  const na = town.roadNodeById.get(edge.a),
    nb = town.roadNodeById.get(edge.b);
  const horiz = Math.abs(na.y - nb.y) < 1;
  const hw = edge.halfWidth; // 7
  const x1 = Math.min(na.x, nb.x),
    x2 = Math.max(na.x, nb.x);
  const y1 = Math.min(na.y, nb.y),
    y2 = Math.max(na.y, nb.y);

  // If this is a grid alley replacing a full street stub in the base plate, narrow the side facades in.
  if (!edge.seam) {
    if (horiz) {
      rect(ctx, x1 + 25, y1 - 28, Math.max(0, x2 - x1 - 50), 28 - hw, slate);
      rect(ctx, x1 + 25, y1 + hw, Math.max(0, x2 - x1 - 50), 23 - hw, slate);
      rect(ctx, x1 + 25, y1 - hw - 5, Math.max(0, x2 - x1 - 50), 5, wall);
      rect(ctx, x1 + 25, y1 + hw, Math.max(0, x2 - x1 - 50), 4, wall);
    } else {
      rect(ctx, x1 - 25, y1 + 23, 25 - hw, Math.max(0, y2 - y1 - 51), slate);
      rect(ctx, x1 + hw, y1 + 23, 25 - hw, Math.max(0, y2 - y1 - 51), slate);
      rect(ctx, x1 - hw - 3, y1 + 23, 3, Math.max(0, y2 - y1 - 51), wall);
      rect(ctx, x1 + hw, y1 + 23, 3, Math.max(0, y2 - y1 - 51), wall);
    }
  }

  // Wet cobblestone corridor.
  const bx = horiz ? x1 : x1 - hw;
  const by = horiz ? y1 - hw : y1;
  const bw = horiz ? x2 - x1 : hw * 2;
  const bh = horiz ? hw * 2 : y2 - y1;
  rect(ctx, bx, by, bw, bh, setts);

  // Wall shadow gradient along alley edges for nocturnal depth.
  const grad = horiz
    ? ctx.createLinearGradient(0, by, 0, by + bh)
    : ctx.createLinearGradient(bx, 0, bx + bw, 0);
  grad.addColorStop(0, "#17111fd0");
  grad.addColorStop(0.22, "#1c152735");
  grad.addColorStop(0.78, "#1c152735");
  grad.addColorStop(1, "#17111fd0");
  rect(ctx, bx, by, bw, bh, grad);

  // Subtle warm wall-lantern pools every ~70 units.
  const len = horiz ? bw : bh;
  for (let d = 35; d < len - 25; d += 70) {
    const lx = horiz ? x1 + d : x1;
    const ly = horiz ? y1 : y1 + d;
    const glow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 11);
    glow.addColorStop(0, "#f5be6b2e");
    glow.addColorStop(1, "#f5be6b00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 11, 0, TAU);
    ctx.fill();
  }

  // Low iron mouth bollards where an alley meets a wide street (8.6u clear opening for bikes & walkers).
  const drawBollards = (mx, my, horizontalEdge) => {
    for (const side of [-1, 1]) {
      const px = horizontalEdge ? mx : mx + side * 4.8;
      const py = horizontalEdge ? my + side * 4.8 : my;
      ctx.fillStyle = "#181320";
      ctx.beginPath();
      ctx.arc(px, py, 1.45, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#a8896f";
      ctx.beginPath();
      ctx.arc(px, py - 0.3, 0.75, 0, TAU);
      ctx.fill();
    }
  };
  const naWide = (town.roadAdj.get(edge.a) || []).some((s) => s.edge.class !== "alley");
  const nbWide = (town.roadAdj.get(edge.b) || []).some((s) => s.edge.class !== "alley");
  if (naWide) {
    const off = edge.seam ? 24 : 27;
    drawBollards(horiz ? na.x + Math.sign(nb.x - na.x) * off : na.x, horiz ? na.y : na.y + Math.sign(nb.y - na.y) * off, horiz);
  }
  if (nbWide) {
    const off = edge.seam ? 24 : 27;
    drawBollards(horiz ? nb.x + Math.sign(na.x - nb.x) * off : nb.x, horiz ? nb.y : nb.y + Math.sign(na.y - nb.y) * off, horiz);
  }
}

// Draw roundabout plaza, circular lane markings, radial crosswalks and raised stone island.
function drawRoundabout(ctx, rb) {
  const { x, y, radius, outerRadius } = rb;
  const circR = roundaboutCircRadius(rb);

  ctx.save();
  // Outer stone kerb shadow & paved wet asphalt apron.
  ctx.beginPath();
  ctx.arc(x, y, outerRadius + 2.2, 0, TAU);
  ctx.fillStyle = "#1b1625";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, outerRadius + 0.8, 0, TAU);
  ctx.fillStyle = edgeStone;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, outerRadius - 0.6, 0, TAU);
  ctx.fillStyle = asphalt;
  ctx.fill();

  // Subtle concentric wet cobble texture inside the circulatory carriageway.
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.arc(x, y, outerRadius - 1.5, 0, TAU);
  ctx.fillStyle = setts;
  ctx.fill();
  ctx.restore();

  // Dashed circulatory ring marking.
  ctx.beginPath();
  ctx.setLineDash([7, 7]);
  ctx.arc(x, y, circR, 0, TAU);
  ctx.strokeStyle = "#8d7b8c9c";
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.setLineDash([]);

  // Yield teeth & subtle crossing strips on each cardinal approach.
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    ctx.save();
    ctx.translate(x + Math.cos(a) * (outerRadius - 2), y + Math.sin(a) * (outerRadius - 2));
    ctx.rotate(a + Math.PI / 2);
    for (let u = -11; u <= 11; u += 4.4) rect(ctx, u - 1, -2.5, 2, 5, "#9c8d9480");
    ctx.restore();
  }

  // Raised central island with dark drop shadow, stone kerb and wet setts plaza.
  ctx.beginPath();
  ctx.arc(x, y + 1.8, radius + 1.8, 0, TAU);
  ctx.fillStyle = "#14101db0";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius + 0.8, 0, TAU);
  ctx.fillStyle = "#1e1928";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius - 0.3, 0, TAU);
  ctx.fillStyle = edgeStone;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius - 2.1, 0, TAU);
  ctx.fillStyle = setts;
  ctx.fill();

  // Subtle green night planting ring on standard boulevard roundabouts.
  if (rb.col !== 3 && rb.col !== 6) {
    ctx.beginPath();
    ctx.arc(x, y, radius - 5.5, 0, TAU);
    ctx.fillStyle = "#213a31";
    ctx.fill();
    ctx.strokeStyle = "#16211e";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    // Central bronze lamp finial glow.
    const glow = ctx.createRadialGradient(x, y, 1, x, y, radius * 0.9);
    glow.addColorStop(0, "#ffd48255");
    glow.addColorStop(1, "#ffd48200");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.9, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawParkBlock(ctx, park, visible) {
  const left = X(park.cols[0]) - CELL_W / 2 + 26;
  const right = X(park.cols[1]) + CELL_W / 2 - 26;
  const top = Y(park.rows[0]) - CELL_H / 2 + 24;
  const bottom = Y(park.rows[1]) + CELL_H / 2 - 24;
  if (!visible(left - 20, top - 20, right - left + 40, bottom - top + 40)) return;

  // Draw landscaped park quadrants around any streets inside the park cells.
  for (let r = park.rows[0]; r <= park.rows[1]; r++) {
    for (let c = park.cols[0]; c <= park.cols[1]; c++) {
      const cx = X(c),
        cy = Y(r);
      const quads = [
        [cx - CELL_W / 2 + 4, cy - CELL_H / 2 + 4, CELL_W / 2 - 31, CELL_H / 2 - 33],
        [cx + 27, cy - CELL_H / 2 + 4, CELL_W / 2 - 31, CELL_H / 2 - 33],
        [cx - CELL_W / 2 + 4, cy + 25, CELL_W / 2 - 31, CELL_H / 2 - 29],
        [cx + 27, cy + 25, CELL_W / 2 - 31, CELL_H / 2 - 29],
      ];
      for (const [qx, qy, qw, qh] of quads) {
        rect(ctx, qx, qy, qw, qh, "#1a2b24");
        ctx.strokeStyle = "#11191a";
        ctx.lineWidth = 1.1;
        ctx.strokeRect(qx, qy, qw, qh);
        // Gravel cross-walk & circular pond/plaza.
        rect(ctx, qx + qw / 2 - 3.5, qy + 3, 7, qh - 6, "#362f3e");
        rect(ctx, qx + 3, qy + qh / 2 - 3.5, qw - 6, 7, "#362f3e");
        // Inked nocturnal trees.
        const trees = [
          [qx + qw * 0.23, qy + qh * 0.28, 12],
          [qx + qw * 0.77, qy + qh * 0.28, 11],
          [qx + qw * 0.25, qy + qh * 0.75, 13],
          [qx + qw * 0.76, qy + qh * 0.74, 12],
        ];
        for (const [tx, ty, tr] of trees) {
          ctx.fillStyle = "#111a18";
          ctx.beginPath();
          ctx.arc(tx + 2, ty + 3, tr, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#233f34";
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#2f5343";
          ctx.beginPath();
          ctx.arc(tx - 2.5, ty - 2.5, tr * 0.62, 0, TAU);
          ctx.fill();
        }
      }
    }
  }
}

function drawPolygon(ctx, poly, fill, stroke, lineWidth = 1.2) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

// Ground-level monument footprints and architectural details (Port-Fer nocturnal palette).
function drawMonumentGround(ctx, m, visible) {
  const xs = m.footprint.map((p) => p[0]),
    ys = m.footprint.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  if (!visible(minX - 24, minY - 40, maxX - minX + 48, maxY - minY + 64)) return;

  ctx.save();
  if (m.style === "tower") {
    // Tour de Fer: wet cobbled esplanade under the tower + 4 corner riveted masonry/iron piers.
    rect(ctx, m.x - 42, m.y - 40, 84, 80, "#241d2e55");
    for (const pier of m.piers || []) {
      const px = pier[0][0],
        py = pier[0][1],
        pw = pier[1][0] - px,
        ph = pier[2][1] - py;
      rect(ctx, px + 1.5, py + 2, pw, ph, "#120e18a8");
      rect(ctx, px, py, pw, ph, "#3d3342");
      rect(ctx, px + 2.2, py + 2.2, pw - 4.4, ph - 4.4, "#594853");
      ctx.strokeStyle = "#191321";
      ctx.lineWidth = 1.3;
      ctx.strokeRect(px, py, pw, ph);
      // Warm uplight on each iron shoe.
      const glow = ctx.createRadialGradient(px + pw / 2, py + ph / 2, 1, px + pw / 2, py + ph / 2, 14);
      glow.addColorStop(0, "#ffcb7744");
      glow.addColorStop(1, "#ffcb7700");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px + pw / 2, py + ph / 2, 14, 0, TAU);
      ctx.fill();
    }
  } else if (m.style === "arch") {
    // Arc des Saisies plinth inside Star Roundabout.
    drawPolygon(ctx, m.footprint, "#4c4352", "#1c1524", 1.6);
    const glow = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 19);
    glow.addColorStop(0, "#ffd38248");
    glow.addColorStop(1, "#ffd38200");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 19, 0, TAU);
    ctx.fill();
    // Twin massive stone legs flanking the glowing arch vault.
    rect(ctx, m.x - 12, m.y - 8, 7, 15, "#8b7f7c");
    rect(ctx, m.x + 5, m.y - 8, 7, 15, "#8b7f7c");
    rect(ctx, m.x - 13, m.y - 12, 26, 7, "#a3968e");
    ctx.strokeStyle = "#201727";
    ctx.lineWidth = 1.1;
    ctx.strokeRect(m.x - 13, m.y - 12, 26, 7);
  } else if (m.style === "obelisk") {
    // Place de la Contrainte stepped plinth & cast shadow.
    drawPolygon(ctx, m.footprint, "#59505e", "#1d1624", 1.4);
    ctx.fillStyle = "#16111e85";
    ctx.beginPath();
    ctx.moveTo(m.x - 3, m.y);
    ctx.lineTo(m.x + 3, m.y);
    ctx.lineTo(m.x + 16, m.y - 11);
    ctx.lineTo(m.x + 12, m.y - 14);
    ctx.closePath();
    ctx.fill();
    rect(ctx, m.x - 5.5, m.y - 5.5, 11, 11, "#8d8078");
    ctx.strokeStyle = "#1e1726";
    ctx.lineWidth = 1;
    ctx.strokeRect(m.x - 5.5, m.y - 5.5, 11, 11);
  } else if (m.style === "opera") {
    // Hôtel des Ventes: neo-baroque opera auction house with copper dome & front stairs.
    drawPolygon(ctx, m.footprint, "#4a404f", "#1a1423", 1.6);
    rect(ctx, minX + 4, minY + 5, maxX - minX - 8, maxY - minY - 14, "#665963");
    // Grand copper-green dome.
    ctx.fillStyle = "#2c5a55";
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 4, 17, 13, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#19262a";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = "#488178";
    ctx.beginPath();
    ctx.ellipse(m.x - 4, m.y - 7, 9, 6, 0, 0, TAU);
    ctx.fill();
    // Illuminated pediment & portico steps facing the street.
    rect(ctx, minX + 10, maxY - 10, maxX - minX - 20, 9, "#a98f7c");
    for (let sx = minX + 14; sx <= maxX - 16; sx += 9) rect(ctx, sx, maxY - 10, 2.2, 6, "#f0c986");
    rect(ctx, minX + 18, maxY - 1, maxX - minX - 36, 4.5, "#876f68");
  } else if (m.style === "basilica") {
    // Sacré-Créancier: white-domed hilltop basilica with illuminated staircase down to row 0.
    drawPolygon(ctx, m.footprint, "#8f888b", "#201929", 1.6);
    // Illuminated stone stair apron descending toward Y(0).
    rect(ctx, m.x - 24, maxY - 1, 48, 8, "#aba29b");
    for (let sy = maxY; sy < maxY + 7; sy += 2.2) rect(ctx, m.x - 22, sy, 44, 0.7, "#3a3140");
    // Three pale limestone domes.
    for (const [dx, dy, r] of [
      [-28, 2, 13],
      [28, 2, 13],
      [0, -4, 19],
    ]) {
      ctx.fillStyle = "#cfc7bf";
      ctx.beginPath();
      ctx.arc(m.x + dx, m.y + dy, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#2a2232";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#efe6d8";
      ctx.beginPath();
      ctx.arc(m.x + dx - r * 0.25, m.y + dy - r * 0.25, r * 0.45, 0, TAU);
      ctx.fill();
    }
  } else if (m.style === "palais") {
    // Palais de Justice: slate courtyard wings + spire on west Île de la Ferre.
    drawPolygon(ctx, m.footprint, "#4c4454", "#1b1524", 1.5);
    rect(ctx, minX + 6, minY + 6, maxX - minX - 12, maxY - minY - 14, "#6f646e");
    rect(ctx, minX + 16, minY + 14, maxX - minX - 32, maxY - minY - 22, "#2f2939");
    // Golden spire highlight.
    ctx.fillStyle = "#e6b868";
    ctx.beginPath();
    ctx.arc(m.x, m.y - 3, 3.2, 0, TAU);
    ctx.fill();
  } else if (m.style === "cathedral") {
    // Notre-Dame-du-Port: twin gothic west towers, cruciform nave, glowing rose window.
    drawPolygon(ctx, m.footprint, "#4b4352", "#1a1423", 1.6);
    // Nave roof ridge & transept.
    rect(ctx, minX + 14, m.y - 16, maxX - minX - 20, 32, "#635a68");
    rect(ctx, m.x - 10, minY + 6, 20, maxY - minY - 12, "#736976");
    // Twin west facade towers facing the parvis.
    rect(ctx, minX + 2, m.y - 24, 16, 16, "#887e82");
    rect(ctx, minX + 2, m.y + 8, 16, 16, "#887e82");
    ctx.strokeStyle = "#1d1626";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(minX + 2, m.y - 24, 16, 16);
    ctx.strokeRect(minX + 2, m.y + 8, 16, 16);
    // Glowing stained-glass rose window facing west.
    const rose = ctx.createRadialGradient(minX + 6, m.y, 1, minX + 6, m.y, 11);
    rose.addColorStop(0, "#ffcf77aa");
    rose.addColorStop(0.5, "#e06d9455");
    rose.addColorStop(1, "#e06d9400");
    ctx.fillStyle = rose;
    ctx.beginPath();
    ctx.arc(minX + 6, m.y, 11, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// Overhead monument pass drawn AFTER actors so cars & walkers visibly pass beneath Tour de Fer
// and tall spires rise above street level in elevated 3/4 view.
export function drawOverheadMonuments(ctx, ox, oy) {
  const endX = ox + game.vw + 60,
    endY = oy + game.vh + 80;
  for (const m of town.monuments) {
    if (m.x < ox - 70 || m.x > endX || m.y < oy - 70 || m.y > endY) continue;
    ctx.save();
    if (m.style === "tower") {
      // Tour de Fer: four riveted iron lattice arches rising from the 4 corner piers to a central elevated deck!
      const deckY = m.y - 34;
      const piers = (m.piers || []).map((p) => ({
        x: (p[0][0] + p[1][0]) / 2,
        y: (p[0][1] + p[2][1]) / 2,
      }));
      // Curved iron lattice arches between adjacent legs (roads pass cleanly underneath!).
      ctx.strokeStyle = "#1b1422";
      ctx.lineWidth = 4.5;
      for (const [a, b] of [
        [0, 1],
        [2, 3],
        [0, 2],
        [1, 3],
      ]) {
        if (!piers[a] || !piers[b]) continue;
        ctx.beginPath();
        ctx.moveTo(piers[a].x, piers[a].y);
        ctx.quadraticCurveTo(
          (piers[a].x + piers[b].x) / 2,
          (piers[a].y + piers[b].y) / 2 - 22,
          piers[b].x,
          piers[b].y,
        );
        ctx.stroke();
      }
      ctx.strokeStyle = "#7c676c";
      ctx.lineWidth = 2.2;
      for (const [a, b] of [
        [0, 1],
        [2, 3],
        [0, 2],
        [1, 3],
      ]) {
        if (!piers[a] || !piers[b]) continue;
        ctx.beginPath();
        ctx.moveTo(piers[a].x, piers[a].y);
        ctx.quadraticCurveTo(
          (piers[a].x + piers[b].x) / 2,
          (piers[a].y + piers[b].y) / 2 - 22,
          piers[b].x,
          piers[b].y,
        );
        ctx.stroke();
      }
      // Diagonal tapered iron legs converging up to the elevated observation deck.
      for (const pr of piers) {
        ctx.strokeStyle = "#1b1422";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(pr.x, pr.y);
        ctx.lineTo(m.x + (pr.x - m.x) * 0.34, deckY + (pr.y - m.y) * 0.25);
        ctx.stroke();
        ctx.strokeStyle = "#8a706e";
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(pr.x, pr.y);
        ctx.lineTo(m.x + (pr.x - m.x) * 0.34, deckY + (pr.y - m.y) * 0.25);
        ctx.stroke();
      }
      // First-floor iron gallery platform with amber uplight beacon.
      rect(ctx, m.x - 17, deckY - 12, 34, 24, "#241d2d");
      rect(ctx, m.x - 15, deckY - 10, 30, 20, "#4c3e4c");
      ctx.strokeStyle = "#c99b6d";
      ctx.lineWidth = 1.1;
      ctx.strokeRect(m.x - 15, deckY - 10, 30, 20);
      // Rising upper spire silhouette.
      ctx.fillStyle = "#31273a";
      ctx.beginPath();
      ctx.moveTo(m.x - 10, deckY - 4);
      ctx.lineTo(m.x + 10, deckY - 4);
      ctx.lineTo(m.x + 2.5, deckY - 38);
      ctx.lineTo(m.x - 2.5, deckY - 38);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#b58b67";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // Amber beacon glow at the spire tip.
      const beacon = ctx.createRadialGradient(m.x, deckY - 38, 0.5, m.x, deckY - 38, 9);
      beacon.addColorStop(0, "#ffe48f");
      beacon.addColorStop(0.4, "#ffae5477");
      beacon.addColorStop(1, "#ffae5400");
      ctx.fillStyle = beacon;
      ctx.beginPath();
      ctx.arc(m.x, deckY - 38, 9, 0, TAU);
      ctx.fill();
    } else if (m.style === "obelisk") {
      // Tall granite obelisk shaft with gilded pyramidion tip rising above the roundabout plinth.
      ctx.fillStyle = "#a3948b";
      ctx.strokeStyle = "#1c1523";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(m.x - 3.6, m.y - 2);
      ctx.lineTo(m.x + 3.6, m.y - 2);
      ctx.lineTo(m.x + 1.8, m.y - 34);
      ctx.lineTo(m.x - 1.8, m.y - 34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ffd66b";
      ctx.beginPath();
      ctx.moveTo(m.x - 1.8, m.y - 34);
      ctx.lineTo(m.x + 1.8, m.y - 34);
      ctx.lineTo(m.x, m.y - 40);
      ctx.closePath();
      ctx.fill();
    } else if (m.style === "arch") {
      // Upper triumphal arch cornice & attic frieze rising above the star island.
      rect(ctx, m.x - 14, m.y - 24, 28, 12, "#9a8d86");
      rect(ctx, m.x - 15, m.y - 26, 30, 3.2, "#c2b3a6");
      ctx.strokeStyle = "#1c1524";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(m.x - 14, m.y - 24, 28, 12);
    }
    ctx.restore();
  }
}

function drawRiverAndIslands(ctx, visible, firstCol, lastCol) {
  const river = town.river;
  const top = river.top,
    bottom = river.bottom,
    waterH = bottom - top;
  const northQuayTop = Y(canalRow) + 16;
  const southQuayBot = Y(town.riverSouthRow) - 15;
  const bridgeSet = new Set(river.bridges.map((b) => b.col));

  // 1. Open water & north/south quay walls across visible columns.
  for (let i = Math.max(0, firstCol); i <= lastCol; i++) {
    const x = X(i),
      left = x - CELL_W / 2;
    if (!visible(left, northQuayTop - 16, CELL_W, southQuayBot - northQuayTop + 32)) continue;

    // North bank approach reflection & stone quay promenade.
    const northKey = cellPlateKey(i, canalRow);
    const approach = northApproaches[northKey] || northApproaches.square;
    ctx.drawImage(approach, left, Y(canalRow), CELL_W, 26);
    ctx.drawImage(plates.northQuay, left, northQuayTop, CELL_W + 0.05, top - northQuayTop + 2);

    // Seamless wet reflective river water filling [top, bottom].
    const tileH = 135;
    for (let wy = top; wy < bottom; wy += tileH) {
      const h = Math.min(tileH + 0.5, bottom - wy + 0.5);
      ctx.drawImage(plates.riverWater, 0, 0, plates.riverWater.width, (h / tileH) * plates.riverWater.height, left, wy, CELL_W + 0.05, h);
    }

    // South stone quay wall & promenade.
    ctx.drawImage(plates.southQuay, left, bottom - 2, CELL_W + 0.05, southQuayBot - bottom + 6);

    // Subtle quay parapet stone edge along north and south water walls.
    ctx.strokeStyle = "#221c2c";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left + CELL_W, top);
    ctx.moveTo(left, bottom);
    ctx.lineTo(left + CELL_W, bottom);
    ctx.stroke();
    ctx.strokeStyle = edgeStone;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // 2. Road bridges (ONLY at columns in town.river.bridges!).
  for (const bridge of river.bridges) {
    if (bridge.col < firstCol - 1 || bridge.col > lastCol + 1) continue;
    const bx = bridge.x,
      hw = bridge.halfWidth;
    if (!visible(bx - hw - 6, northQuayTop - 10, (hw + 6) * 2, southQuayBot - northQuayTop + 20)) continue;
    // Draw bridge deck spanning from north quay to south quay (island draws over its middle section next).
    const bTop = northQuayTop + 4,
      bBot = southQuayBot - 2;
    ctx.drawImage(plates.riverBridge, bx - hw, bTop, hw * 2, bBot - bTop);
    // Stone bridge parapets + warm amber bridge lamps.
    for (const side of [-1, 1]) {
      const px = bx + side * (hw - 1);
      rect(ctx, px - 1.2, bTop, 2.4, bBot - bTop, "#251f30");
      rect(ctx, px - 0.5, bTop, 1.0, bBot - bTop, edgeStone);
    }
    markLane(ctx, bx, bTop, true, 14, bBot - bTop - 24, 19, 10);
  }

  // 3. Île de la Ferre (and any other river islands).
  for (const isl of river.islands) {
    if (!visible(isl.left - 24, isl.top - 16, isl.right - isl.left + 48, isl.bottom - isl.top + 32)) continue;
    const iw = isl.right - isl.left,
      ih = isl.bottom - isl.top;
    const prow = 24;
    const islandPath = () => {
      ctx.beginPath();
      ctx.moveTo(isl.left + prow, isl.top);
      ctx.lineTo(isl.right - prow, isl.top);
      ctx.lineTo(isl.right, (isl.top + isl.bottom) / 2);
      ctx.lineTo(isl.right - prow, isl.bottom);
      ctx.lineTo(isl.left + prow, isl.bottom);
      ctx.lineTo(isl.left, (isl.top + isl.bottom) / 2);
      ctx.closePath();
    };
    // Dark water shadow around the stone island hull.
    ctx.save();
    ctx.translate(0, 4);
    islandPath();
    ctx.fillStyle = "#101924aa";
    ctx.fill();
    ctx.restore();

    // Clipped painted island streets & quays.
    ctx.save();
    islandPath();
    ctx.clip();
    rect(ctx, isl.left, isl.top, iw, ih, setts);
    for (let col = Math.max(0, firstCol); col <= lastCol; col++) {
      const cx = X(col) - CELL_W / 2,
        cy = Y(town.riverRow) - CELL_H / 2;
      if (cx + CELL_W < isl.left || cx > isl.right) continue;
      ctx.drawImage(plates[cellPlateKey(col, town.riverRow)], cx, cy, CELL_W + 0.03, CELL_H + 0.03);
    }
    // Clean central island avenue paving along Y(riverRow).
    rect(ctx, isl.left + 16, Y(town.riverRow) - 18, iw - 32, 36, asphalt);
    // Stone quay promenade strips along the island's north and south banks.
    rect(ctx, isl.left, isl.top, iw, 16, setts);
    rect(ctx, isl.left, isl.bottom - 16, iw, 16, setts);
    // Bridge junctions meeting the island.
    for (const bCol of [8, 10]) {
      if (bridgeSet.has(bCol)) rect(ctx, X(bCol) - 20, isl.top, 40, ih, asphalt);
    }
    markLane(ctx, X(8), Y(town.riverRow), false, 30, X(10) - X(8) - 60, 19, 10);
    ctx.restore();

    // Stone quay wall border around Île de la Ferre.
    ctx.save();
    islandPath();
    ctx.strokeStyle = "#1f1929";
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = edgeStone;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 4. River moorings (timber wharf fenders, mooring bollards & warm boarding lantern).
  for (const m of river.moorings) {
    if (!visible(m.x - 24, m.y - 24, 48, 48)) continue;
    const isNorthFace = m.y > m.quay.y; // water is south of quay
    const edgeY = isNorthFace ? m.quay.y + 11 : m.quay.y - 11;
    // Timber landing fender along the quay wall.
    rect(ctx, m.x - 16, edgeY - 2, 32, 4, "#3b2824");
    rect(ctx, m.x - 15, edgeY - 1.2, 30, 2.2, "#7c5845");
    // Stepped stone landing pad on the walkable quay.
    rect(ctx, m.quay.x - 12, m.quay.y - 5, 24, 10, "#463d4f");
    ctx.strokeStyle = "#1d1626";
    ctx.lineWidth = 1;
    ctx.strokeRect(m.quay.x - 12, m.quay.y - 5, 24, 10);
    // Mooring bollards & soft teal/amber wharf lantern.
    for (const dx of [-10, 10]) {
      ctx.fillStyle = "#1a1423";
      ctx.beginPath();
      ctx.arc(m.quay.x + dx, edgeY, 1.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#d9a96c";
      ctx.beginPath();
      ctx.arc(m.quay.x + dx, edgeY - 0.3, 0.9, 0, TAU);
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(m.quay.x, m.quay.y, 1, m.quay.x, m.quay.y, 12);
    glow.addColorStop(0, "#6de5cf48");
    glow.addColorStop(1, "#6de5cf00");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(m.quay.x, m.quay.y, 12, 0, TAU);
    ctx.fill();
  }
}

function drawTown(ox, oy, ctx, width, height) {
  const { firstCol, lastCol, firstRow, lastRow } = town.visibleCells(ox, oy, width, height, CELL_W / 2);
  const endX = ox + width + 1,
    endY = oy + height + 1;
  const visible = (x, y, w, h) => x + w >= ox && x <= endX && y + h >= oy && y <= endY;

  // 1. Base street plates (skip open-water river cells).
  for (let j = Math.max(0, firstRow); j <= lastRow; j++) {
    if (j === town.riverRow) continue;
    for (let i = Math.max(0, firstCol); i <= lastCol; i++) {
      const x = X(i) - CELL_W / 2,
        y = Y(j) - CELL_H / 2;
      if (visible(x, y, CELL_W, CELL_H))
        ctx.drawImage(plates[cellPlateKey(i, j)], x, y, CELL_W + 0.03, CELL_H + 0.03);
    }
  }

  // 2. Horizontal seam joins & service alleys between neighbouring land cells.
  for (let j = Math.max(0, firstRow); j <= lastRow; j++) {
    if (j === town.riverRow) continue;
    for (let i = Math.max(1, firstCol); i <= lastCol; i++) {
      const x = X(i) - CELL_W / 2,
        y = Y(j);
      if (!visible(x - 14, y - CELL_H / 2, 28, CELL_H)) continue;
      const l = cellPlateKey(i - 1, j),
        r = cellPlateKey(i, j);
      const lMeta = town.cellMeta(i - 1, j);
      if (lMeta.wideArms.e) {
        const road = getJoin("road:" + l + r, plates[l], plates[r], true, CELL_H / 2 - 21, 42, 14);
        ctx.drawImage(road, x - 14, y - 21, 28, 42);
      }
      sideAlley(ctx, x, y, l, r, false);
      drawAlleyMouth(ctx, x, y, l, r);
      sideAlley(ctx, x, y, l, r, true);
    }
  }

  // 3. Vertical seam joins & back lanes between neighbouring land rows.
  for (let j = Math.max(1, firstRow); j <= lastRow; j++) {
    if (j === town.riverRow || j === town.riverSouthRow) continue;
    for (let i = Math.max(0, firstCol); i <= lastCol; i++) {
      const x = X(i),
        y = Y(j) - CELL_H / 2;
      if (!visible(x - CELL_W / 2, y - 12, CELL_W, 24)) continue;
      const n = cellPlateKey(i, j - 1),
        s = cellPlateKey(i, j);
      const nMeta = town.cellMeta(i, j - 1);
      if (nMeta.wideArms.s) {
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
      }
      backLane(ctx, x, y);
    }
  }

  // 4. Parks (landscaped Parisian gardens).
  for (const park of town.parks || []) drawParkBlock(ctx, park, visible);

  // 5. Missing road arm covers for dead ends and tee junctions (skip river edge covered by quays).
  const parkCell = (c, r) =>
    (town.parks || []).some((pk) => c >= pk.cols[0] && c <= pk.cols[1] && r >= pk.rows[0] && r <= pk.rows[1]);
  for (let j = Math.max(0, firstRow); j <= lastRow; j++) {
    if (j === town.riverRow) continue;
    for (let i = Math.max(0, firstCol); i <= lastCol; i++) {
      const meta = town.cellMeta(i, j);
      const cx = X(i),
        cy = Y(j);
      const isPk = parkCell(i, j);
      if (!meta.allArms.n && j > 0 && j !== town.riverSouthRow) drawMissingArmCover(ctx, cx, cy, "n", isPk);
      if (!meta.allArms.s && j < town.rows - 1 && j !== canalRow) drawMissingArmCover(ctx, cx, cy, "s", isPk);
      if (!meta.allArms.w && i > 0) drawMissingArmCover(ctx, cx, cy, "w", isPk);
      if (!meta.allArms.e && i < town.cols - 1) drawMissingArmCover(ctx, cx, cy, "e", isPk);
    }
  }

  // 6. River la Ferre, Quays, Bridges, Île de la Ferre, and Moorings.
  if (visible(0, Y(canalRow) - 10, W, Y(town.riverSouthRow) - Y(canalRow) + 20))
    drawRiverAndIslands(ctx, visible, firstCol, lastCol);

  // 7. Narrow cobblestone alleys & opened seam service alleys.
  for (const edge of town.roads.edges) {
    if (edge.class !== "alley") continue;
    const na = town.roadNodeById.get(edge.a),
      nb = town.roadNodeById.get(edge.b);
    const minX = Math.min(na.x, nb.x) - 28,
      minY = Math.min(na.y, nb.y) - 28;
    const bw = Math.abs(nb.x - na.x) + 56,
      bh = Math.abs(nb.y - na.y) + 56;
    if (visible(minX, minY, bw, bh)) drawAlleyOverlay(ctx, edge);
  }

  // 8. Roundabouts (paved circulatory plaza, markings, central island).
  const roundabouts = town.roads.nodes.filter((n) => n.kind === "roundabout");
  for (const rb of roundabouts) {
    if (visible(rb.x - rb.outerRadius - 8, rb.y - rb.outerRadius - 8, (rb.outerRadius + 8) * 2, (rb.outerRadius + 8) * 2))
      drawRoundabout(ctx, rb);
  }

  // 9. Ground-level monument footprints & silhouettes.
  for (const m of town.monuments) drawMonumentGround(ctx, m, visible);

  // 10. Lane dashes along real avenues and streets (avoiding roundabouts, alleys and river gaps).
  for (const edge of town.roads.edges) {
    if (edge.class === "alley" || edge.bridge) continue;
    const na = town.roadNodeById.get(edge.a),
      nb = town.roadNodeById.get(edge.b);
    if (na.row === town.riverRow && nb.row === town.riverRow) continue;
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

// Cut foreground objects from the registered plate once. Only their painted
// silhouettes cover actors standing behind them.
const propSprites = new WeakMap();
export function drawStreetProp({ x, y, item }) {
  let sprite = propSprites.get(item);
  if (!sprite) {
    const left = Math.floor(Math.min(...item.outline.map((p) => p[0])) * plateScale) / plateScale,
      top = Math.floor(item.outline[0][1] * plateScale) / plateScale;
    const w = Math.ceil((2 * (item.x - left) + 0.4) * plateScale),
      h = Math.ceil((item.y - top) * plateScale);
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

export { plateScale, plates, prepareTown, streetLayer };
