import { plates, plateScale } from "./streets.js";
import { CELL_H, CELL_W, TAU, X, Y, town } from "./town.js";
import { artwork, game } from "../core/state.js";
import { g, rect } from "../platform/canvas.js";
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

// Draw one horizontal ring leg (row 1 or row 11, cols minCol..maxCol).
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
  // Clip cleanly at the straight-to-corner transitions so the curved corner girder joins smoothly.
  g.beginPath();
  g.rect(ring.left + ring.cornerR - 2, y - 4, ring.right - ring.left - 2 * ring.cornerR + 4, height + 8);
  g.clip();
  for (let col = minC; col <= maxC; col++) {
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
  g.restore();
}

// Draw a riveted vertical ring viaduct iron pier (depth-sorted with actors at its ground foot).
function drawVerticalPier(pier) {
  const deckLift = town.ring.deckLift;
  const topY = pier.y - deckLift + 6;
  const h = pier.y - topY;
  // Base shadow and masonry plinth.
  rect(g, pier.x - 4.5, pier.y - 2.6, 9, 5.2, "#171220b8");
  rect(g, pier.x - 3.6, pier.y - 3.6, 7.2, 4.4, "#4b4050");
  // Riveted iron shaft matching market.webp ironwork palette.
  rect(g, pier.x - 2.8, topY, 5.6, h - 2.5, "#241d2e");
  rect(g, pier.x - 1.9, topY, 3.8, h - 2.5, "#423647");
  rect(g, pier.x - 1.7, topY, 0.9, h - 2.5, "#876b64"); // warm sodium west highlight
  // Cross-bracing X lines.
  g.strokeStyle = "#191323";
  g.lineWidth = 0.7;
  g.beginPath();
  for (let sy = topY + 4; sy < pier.y - 8; sy += 9) {
    g.moveTo(pier.x - 2, sy);
    g.lineTo(pier.x + 2, sy + 7);
    g.moveTo(pier.x + 2, sy);
    g.lineTo(pier.x - 2, sy + 7);
  }
  g.stroke();
}

// Draw a ring railway station street stair (ground pass) or elevated platform canopy (overhead pass).
function drawStationGround(st) {
  const sx = st.street.x,
    sy = st.street.y;
  // Walkable transit landing pad & subtle green-gold Petite Ceinture indicator.
  rect(g, sx - 11, sy - 5, 22, 10, "#243531cc");
  g.strokeStyle = "#5cb88a";
  g.lineWidth = 0.9;
  g.strokeRect(sx - 11, sy - 5, 22, 10);
  // Staircase connecting street landing to the elevated viaduct side.
  const dx = st.stop.x - sx,
    dy = st.stop.y - town.ring.deckLift - sy;
  g.strokeStyle = "#1a1424";
  g.lineWidth = 5.5;
  g.beginPath();
  g.moveTo(sx, sy);
  g.lineTo(sx + dx * 0.45, sy + dy * 0.45);
  g.stroke();
  g.strokeStyle = "#7c696d";
  g.lineWidth = 3.2;
  g.stroke();
  // Illuminated station lantern post.
  const glow = g.createRadialGradient(sx, sy, 0.5, sx, sy, 10);
  glow.addColorStop(0, "#76e8b055");
  glow.addColorStop(1, "#76e8b000");
  g.fillStyle = glow;
  g.beginPath();
  g.arc(sx, sy, 10, 0, TAU);
  g.fill();
}

function drawStationOverhead(st) {
  const ring = town.ring;
  const x = st.stop.x,
    y = st.stop.y - ring.deckLift;
  const horiz = Math.abs(st.stop.y - ring.top) < 10 || Math.abs(st.stop.y - ring.bottom) < 10;
  const pw = horiz ? 56 : 18,
    ph = horiz ? 17 : 56;
  // Riveted Parisian green-iron station canopy over the platform.
  rect(g, x - pw / 2, y - ph / 2, pw, ph, "#1b2829");
  rect(g, x - pw / 2 + 1.2, y - ph / 2 + 1.2, pw - 2.4, ph - 2.4, "#2d4c46");
  g.strokeStyle = "#8ab49d";
  g.lineWidth = 0.85;
  g.strokeRect(x - pw / 2 + 1.2, y - ph / 2 + 1.2, pw - 2.4, ph - 2.4);
  // Warm amber platform lamps.
  for (const off of [-16, 0, 16]) {
    const lx = horiz ? x + off : x,
      ly = horiz ? y : y + off;
    const glow = g.createRadialGradient(lx, ly, 0.5, lx, ly, 7);
    glow.addColorStop(0, "#ffe49499");
    glow.addColorStop(1, "#ffe49400");
    g.fillStyle = glow;
    g.beginPath();
    g.arc(lx, ly, 7, 0, TAU);
    g.fill();
  }
}

// Draw the overhead deck along the vertical legs (including West & East Rail Bridges over la Ferre)
// and the four smooth rounded corners linking into the horizontal spans.
function drawVerticalAndCornerDeck(ox, oy) {
  const ring = town.ring;
  const lift = ring.deckLift;
  const viewLeft = ox - 40,
    viewRight = ox + game.vw + 40;
  const viewTop = oy - 50,
    viewBottom = oy + game.vh + 70;
  const pts = ring.points;

  const drawDeckStroke = (points, width, color) => {
    g.beginPath();
    g.moveTo(points[0].x, points[0].y - lift);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y - lift);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "butt";
    g.lineJoin = "round";
    g.stroke();
  };

  // Collect visible vertical and corner polyline runs (skipping straight interior horizontal legs already drawn by market/span ironwork).
  const isStraightHoriz = (a, b) =>
    Math.abs(a.y - b.y) < 0.5 &&
    Math.min(a.x, b.x) >= ring.left + ring.cornerR - 1 &&
    Math.max(a.x, b.x) <= ring.right - ring.cornerR + 1;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    if (isStraightHoriz(a, b)) continue;
    const minX = Math.min(a.x, b.x) - 16,
      maxX = Math.max(a.x, b.x) + 16;
    const minY = Math.min(a.y, b.y) - lift - 20,
      maxY = Math.max(a.y, b.y) - lift + 26;
    if (maxX < viewLeft || minX > viewRight || maxY < viewTop || minY > viewBottom) continue;

    // Iron girder drop-skirt under deck edge (adds 3/4 depth).
    g.save();
    g.translate(0, 7);
    drawDeckStroke([a, b], 15, "#191322");
    g.translate(0, -2.5);
    drawDeckStroke([a, b], 13.5, "#362c3e");
    g.restore();

    // Main viaduct deck, ballast bed and rails.
    drawDeckStroke([a, b], 14.5, "#1c1626");
    drawDeckStroke([a, b], 11.6, "#3a3044");
    drawDeckStroke([a, b], 8.6, "#2a2234");

    // Twin steel rails offset ±2.4 perpendicular to segment.
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len,
      ny = dx / len;
    for (const side of [-2.4, 2.4]) {
      g.beginPath();
      g.moveTo(a.x + nx * side, a.y - lift + ny * side);
      g.lineTo(b.x + nx * side, b.y - lift + ny * side);
      g.strokeStyle = "#8f8394";
      g.lineWidth = 0.85;
      g.stroke();
    }
    // Parapet warm rim highlight.
    for (const side of [-6.3, 6.3]) {
      g.beginPath();
      g.moveTo(a.x + nx * side, a.y - lift + ny * side);
      g.lineTo(b.x + nx * side, b.y - lift + ny * side);
      g.strokeStyle = side < 0 ? "#9c7c71" : "#221a2d";
      g.lineWidth = 1.0;
      g.stroke();
    }

    // Arched iron rail-bridge side trusses across River la Ferre on the West and East legs.
    const river = town.river;
    if (river && Math.abs(a.x - b.x) < 1) {
      const segTop = Math.min(a.y, b.y),
        segBot = Math.max(a.y, b.y);
      if (segBot > river.top && segTop < river.bottom) {
        const bx = a.x;
        const rTop = Math.max(segTop, river.top) - lift;
        const rBot = Math.min(segBot, river.bottom) - lift;
        g.strokeStyle = "#7a6368";
        g.lineWidth = 1.3;
        for (const side of [-7.2, 7.2]) {
          g.beginPath();
          for (let ry = rTop; ry < rBot; ry += 18) {
            g.moveTo(bx + side, ry);
            g.lineTo(bx + side, Math.min(rBot, ry + 18));
            g.moveTo(bx + side, ry);
            g.lineTo(bx + side * 0.55, Math.min(rBot, ry + 9));
          }
          g.stroke();
        }
      }
    }
  }
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

  // 2. Depth-sorted vertical iron piers on the West & East legs.
  for (const pier of ring.piers || []) {
    if (pier.orientation !== "vertical") continue;
    if (
      pier.x < ox - 16 ||
      pier.x > ox + game.vw + 16 ||
      pier.y < oy - 12 ||
      pier.y - ring.deckLift > oy + game.vh + 16
    )
      continue;
    rails.push({
      y: pier.y,
      draw: (overhead) => {
        if (!overhead) drawVerticalPier(pier);
      },
    });
  }

  // 3. Visible Petite Ceinture station street landings & overhead canopies.
  for (const st of ring.stations || []) {
    const sx = st.stop.x,
      sy = st.stop.y;
    if (sx < ox - 50 || sx > ox + game.vw + 50 || sy < oy - 60 || sy - ring.deckLift > oy + game.vh + 60)
      continue;
    rails.push({
      y: st.street.y - 3,
      draw: (overhead) => (overhead ? drawStationOverhead(st) : drawStationGround(st)),
    });
  }

  // 4. Overhead vertical/corner deck (runs once in the overhead pass). The trains ride on it:
  // the renderer calls drawRingTrains from src/art/train.js once all the overhead layers are down.
  rails.push({
    y: -1e9,
    draw: (overhead) => {
      if (overhead) drawVerticalAndCornerDeck(ox, oy);
    },
  });

  return rails;
}
