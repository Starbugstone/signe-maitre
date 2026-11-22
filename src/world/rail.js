import { plates, plateScale } from "./streets.js";
import { CELL_H, CELL_W, TAU, X, Y, town } from "./town.js";
import { PLATFORM_HALF_LENGTH, ringOf } from "../game/ring-route.js";
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

// The raised platform beside the track on the stair side, as long as a train, with its
// yellow edge line, a green iron railing and warm lamps. Trains stop alongside it.
function drawStationOverhead(st) {
  const ring = ringOf(town),
    station = ring.stations.find((o) => o.id === st.id),
    lift = ring.deckLift,
    side = station.side,
    half = PLATFORM_HALF_LENGTH;
  const edge = (offset) => {
    const out = [];
    for (let s = station.s - half; s <= station.s + half + 0.01; s += 6) {
      const pose = ring.poseAt(s, 0.5);
      out.push({ x: pose.x - Math.sin(pose.a) * offset * side, y: pose.y + Math.cos(pose.a) * offset * side - lift });
    }
    return out;
  };
  const inner = edge(7.4),
    outer = edge(16);
  const band = (a, b, fill) => {
    g.beginPath();
    for (const q of a) g.lineTo(q.x, q.y);
    for (const q of [...b].reverse()) g.lineTo(q.x, q.y);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  const line = (points, width, colour, dy = 0) => {
    g.beginPath();
    for (const q of points) g.lineTo(q.x, q.y + dy);
    g.lineWidth = width;
    g.strokeStyle = colour;
    g.stroke();
  };
  g.save();
  g.lineJoin = g.lineCap = "round";
  // Riveted iron fascia below the slab, then the worn stone slab itself.
  band(outer, outer.map((q) => ({ x: q.x, y: q.y + 3.4 })), "#211a27");
  line(outer, 0.5, "#4a3d4c", 1.1);
  g.fillStyle = "#7d6a6a";
  for (let i = 0; i < outer.length; i++) g.fillRect(outer[i].x - 0.25, outer[i].y + 2.1, 0.5, 0.5);
  band(inner, outer, "#4f434d");
  band(edge(9.2), edge(15.2), "#62555d");
  // Flagstone joints across the slab and a seam down its middle.
  const near = edge(9.2),
    far = edge(15.2);
  g.strokeStyle = "#3a303b";
  g.lineWidth = 0.35;
  g.beginPath();
  for (let i = 0; i < near.length; i++) {
    const f = i % 2 ? 0.5 : 0;
    const a = { x: near[i].x + (far[i].x - near[i].x) * f, y: near[i].y + (far[i].y - near[i].y) * f };
    g.moveTo(a.x, a.y);
    g.lineTo(i % 2 ? far[i].x : (near[i].x + far[i].x) / 2, i % 2 ? far[i].y : (near[i].y + far[i].y) / 2);
  }
  g.stroke();
  line(edge(12.2), 0.3, "#3a303b");
  // Wet sheen catching the lamps.
  line(edge(11), 0.5, "#8b767344");
  line(inner, 1.2, "#2a2230");
  line(edge(8.3), 0.8, "#d9b347");
  line(edge(8.3), 0.3, "#fff0a0", -0.25);
  line(outer, 0.9, "#1a1422");
  // Green-iron railing along the outer edge.
  line(outer, 0.7, "#5f8d76", -3.6);
  const posts = edge(15.6);
  g.strokeStyle = "#2d4c46";
  g.lineWidth = 0.6;
  g.beginPath();
  for (let i = 0; i < posts.length; i += 2) {
    g.moveTo(posts[i].x, posts[i].y);
    g.lineTo(posts[i].x, posts[i].y - 3.8);
  }
  g.stroke();
  // Lamps every few metres, pooling warm light on the slab.
  const lamps = edge(13.8);
  for (let i = 3; i < lamps.length - 2; i += 8) {
    const { x, y } = lamps[i];
    g.fillStyle = "#1d1822";
    g.fillRect(x - 0.35, y - 9, 0.7, 9);
    g.fillStyle = "#ffe7a6";
    g.beginPath();
    g.arc(x, y - 9.4, 0.9, 0, TAU);
    g.fill();
    g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(x, y - 4, 0.5, x, y - 4, 11);
    glow.addColorStop(0, "#ffc86a3a");
    glow.addColorStop(1, "#ffc86a00");
    g.fillStyle = glow;
    g.fillRect(x - 11, y - 15, 22, 22);
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
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

    // Lattice girder on the side facing the camera, like the painted market ironwork.
    if (Math.abs(a.x - b.x) > 0.5) {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy) || 1,
        // The face toward the camera: the deck edge with the larger screen y.
        nx = (dy / len) * (dx > 0 ? -1 : 1),
        ny = (-dx / len) * (dx > 0 ? -1 : 1),
        top = 7.25,
        drop = 6.2;
      const P = (f, down) => ({ x: a.x + dx * f + nx * top, y: a.y + dy * f + ny * top - lift + down });
      g.beginPath();
      const steps = Math.max(1, Math.round(len / 5));
      for (let i = 0; i <= steps; i++) {
        const q = P(i / steps, i % 2 ? drop : 0.8);
        i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y);
      }
      g.strokeStyle = "#5a4a56";
      g.lineWidth = 0.7;
      g.stroke();
      g.beginPath();
      const t0 = P(0, drop),
        t1 = P(1, drop);
      g.moveTo(t0.x, t0.y);
      g.lineTo(t1.x, t1.y);
      g.strokeStyle = "#7d6460";
      g.lineWidth = 0.9;
      g.stroke();
    }

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
    const reach = PLATFORM_HALF_LENGTH + 20;
    if (sx < ox - reach || sx > ox + game.vw + reach || sy < oy - reach || sy - ring.deckLift > oy + game.vh + reach)
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
