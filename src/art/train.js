// La Petite Ceinture on screen: carriages on the raised deck, the temporary
// deck and piers used until the town paints its own ring viaduct, station
// signs at the stair feet, and the ring on the city map.
import { artwork, game, p } from "../core/state.js";
import { g } from "../platform/canvas.js";
import { town } from "../world/town.js";
import { blockedIn } from "../world/collision.js";
import { drawStreetProp } from "../world/streets.js";
import { dude } from "./pedestrians.js";
import { ringLine } from "../game/transit.js";
import { CAR_HALF_WIDTH, CAR_LENGTH, carriagesOf, platformSpot, trainsetAt, TAU } from "../game/ring-route.js";

// The painted metro car is 544 px long for 51 world units; its rail head is at y = 168.
const px = CAR_LENGTH / 544;
const railRow = 168,
  eaveRow = 61;
const zOf = (row) => (railRow - row) * px;
const roofZ = zOf(eaveRow),
  baseZ = zOf(181);
const doors = [64, 440],
  doorWidth = 40;

function texture(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"), w, h);
  return c;
}
let textures;
function carTextures() {
  if (textures) return textures;
  const roof = texture(256, 48, (c, w, h) => {
    // Row 0 is the far eave, row 47 the near one. A curved tin roof catches the
    // street light on its near slope, with a raised clerestory along the crest.
    const base = c.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "#2e2326");
    base.addColorStop(0.15, "#5a4946");
    base.addColorStop(0.62, "#8c766d");
    base.addColorStop(0.88, "#6a5550");
    base.addColorStop(1, "#3a1b1f");
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = rnd() < 0.5 ? "#00000018" : "#ffd9a012";
      c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1);
    }
    c.fillStyle = "#3b2d2c";
    c.fillRect(12, 15, w - 24, 15);
    c.fillStyle = "#8f7a72";
    c.fillRect(12, 15, w - 24, 2);
    for (let x = 18; x < w - 24; x += 21) {
      c.fillStyle = "#1f1619";
      c.fillRect(x - 1, 18, 17, 10);
      const glow = c.createLinearGradient(0, 19, 0, 27);
      glow.addColorStop(0, "#f7c46a");
      glow.addColorStop(1, "#b8692b");
      c.fillStyle = glow;
      c.fillRect(x, 19, 15, 8);
      c.fillStyle = "#1f161980";
      c.fillRect(x + 7, 19, 1, 8);
    }
    c.fillStyle = "#33262680";
    for (let x = 42; x < w - 10; x += 43) c.fillRect(x, 2, 1.5, h - 4);
    c.strokeStyle = "#1a1216";
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
  function end(cab) {
    return texture(96, 120, (c, w, h) => {
      c.fillStyle = "#1c1417";
      c.fillRect(0, 0, w, h);
      const body = c.createLinearGradient(0, 0, w, 0);
      body.addColorStop(0, "#5a121b");
      body.addColorStop(0.5, "#8c2129");
      body.addColorStop(1, "#5a121b");
      c.fillStyle = body;
      c.fillRect(3, 3, w - 6, 96);
      if (cab) {
        for (const x of [12, 52]) {
          const pane = c.createLinearGradient(0, 14, 0, 46);
          pane.addColorStop(0, "#ffe08c");
          pane.addColorStop(1, "#d98a35");
          c.fillStyle = "#24171a";
          c.fillRect(x - 2, 12, 36, 38);
          c.fillStyle = pane;
          c.fillRect(x, 14, 32, 34);
        }
        c.fillStyle = "#24171a";
        c.fillRect(30, 3, 36, 9);
        c.fillStyle = cab === "front" ? "#ffe9b0" : "#e0302c";
        for (const x of [18, 78]) {
          c.beginPath();
          c.arc(x, 78, 6, 0, TAU);
          c.fill();
        }
      } else {
        // Gangway door and bellows between coupled carriages.
        c.fillStyle = "#2a1a1c";
        c.fillRect(26, 12, 44, 84);
        c.fillStyle = "#d59a45";
        c.fillRect(34, 20, 28, 26);
      }
      c.fillStyle = "#2b2224";
      c.fillRect(8, 99, w - 16, 21);
      c.fillStyle = "#6f5a48";
      c.fillRect(20, 104, w - 40, 5);
    });
  }
  textures = { roof, cabFront: end("front"), cabRear: end("rear"), gangway: end(null) };
  return textures;
}

// Map an image rectangle onto a parallelogram given by its origin and two edges.
function mapOnto(image, sx, sy, sw, sh, o, ex, ey) {
  g.save();
  g.transform(ex.x / sw, ex.y / sw, ey.x / sh, ey.y / sh, o.x, o.y);
  g.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  g.restore();
}
function quad(points, fill) {
  g.beginPath();
  for (const q of points) g.lineTo(q.x, q.y);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function drawPlaceholderCar(car, lift, state) {
  const t = carTextures();
  const ux = Math.cos(car.a),
    uy = Math.sin(car.a),
    nx = -uy,
    ny = ux;
  const hl = CAR_LENGTH / 2 - 1.5,
    hw = CAR_HALF_WIDTH;
  const at = (u, v, z) => ({ x: car.x + ux * u + nx * v, y: car.y + uy * u + ny * v - lift - z });
  // Shadow on the deck and window light spilling over the parapet side.
  quad([at(-hl, -hw, -0.4), at(hl, -hw, -0.4), at(hl + 1, hw + 1.4, -0.4), at(-hl + 1, hw + 1.4, -0.4)], "#0d0a1470");
  const near = ny >= 0 ? 1 : -1;
  g.save();
  g.globalCompositeOperation = "lighter";
  quad([at(-hl + 4, near * hw, 0), at(hl - 4, near * hw, 0), at(hl - 6, near * (hw + 5), 0), at(-hl + 6, near * (hw + 5), 0)], "#ff9a3214");
  g.restore();
  if (car.cab === "front") {
    const nose = at(hl, 0, 2);
    const beam = g.createRadialGradient(nose.x, nose.y, 0, nose.x, nose.y, 30);
    beam.addColorStop(0, "#ffe2a040");
    beam.addColorStop(1, "#ffe2a000");
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(at(hl, -2.5, 2).x, at(hl, -2.5, 2).y);
    g.lineTo(at(hl + 34, -10, 0).x, at(hl + 34, -10, 0).y);
    g.lineTo(at(hl + 34, 10, 0).x, at(hl + 34, 10, 0).y);
    g.lineTo(at(hl, 2.5, 2).x, at(hl, 2.5, 2).y);
    g.fill();
  }
  // The side facing the camera, painted from the metro car, left to right on screen.
  if (Math.abs(ny) > 0.02) {
    const v = near * hw;
    let a = at(-hl, v, baseZ),
      b = at(hl, v, baseZ);
    if (b.x < a.x) [a, b] = [b, a];
    const top = { x: 0, y: -(roofZ - baseZ) };
    const origin = { x: a.x, y: a.y + top.y };
    const along = { x: b.x - a.x, y: b.y - a.y };
    mapOnto(artwork.metro, 0, eaveRow, 544, 181 - eaveRow, origin, along, { x: 0, y: roofZ - baseZ });
    if (state.doors) {
      g.save();
      g.transform(along.x / 544, along.y / 544, 0, (roofZ - baseZ) / (181 - eaveRow), origin.x, origin.y - eaveRow * ((roofZ - baseZ) / (181 - eaveRow)));
      const open = Math.min(1, (state.doorsFor ?? 1) * 2.5);
      for (const x of doors) {
        const light = g.createLinearGradient(0, 64, 0, 132);
        light.addColorStop(0, "#fff0b8");
        light.addColorStop(1, "#e9a14a");
        g.fillStyle = "#24161a";
        g.fillRect(x + 2, 64, doorWidth - 4, 68);
        g.fillStyle = light;
        g.fillRect(x + doorWidth / 2 - (open * (doorWidth - 8)) / 2, 66, open * (doorWidth - 8), 64);
      }
      g.restore();
    }
  }
  // The end facing the camera: a cab front, a tail or the gangway to the next carriage.
  if (Math.abs(uy) > 0.02) {
    const sign = uy > 0 ? 1 : -1;
    const cab = car.cab === "front" ? (sign > 0 ? "cabFront" : "gangway") : car.cab === "rear" ? (sign < 0 ? "cabRear" : "gangway") : "gangway";
    let a = at(sign * hl, -hw, baseZ),
      b = at(sign * hl, hw, baseZ);
    if (b.x < a.x) [a, b] = [b, a];
    const height = roofZ - baseZ;
    mapOnto(t[cab], 0, 0, 96, 120, { x: a.x, y: a.y - height }, { x: b.x - a.x, y: b.y - a.y }, { x: 0, y: height });
  }
  // Roof, its far edge first in the texture.
  const r0 = at(-hl, -near * hw, roofZ),
    r1 = at(hl, -near * hw, roofZ),
    r3 = at(-hl, near * hw, roofZ);
  mapOnto(t.roof, 0, 0, 256, 48, r0, { x: r1.x - r0.x, y: r1.y - r0.y }, { x: r3.x - r0.x, y: r3.y - r0.y });
  // Inked contour round the roof, as on the painted street art.
  g.beginPath();
  for (const q of [r0, r1, at(hl, near * hw, roofZ), r3]) g.lineTo(q.x, q.y);
  g.closePath();
  g.lineWidth = 0.32;
  g.strokeStyle = "#1a1216";
  g.stroke();
  if (car.cab) {
    // Pantograph above the cab car.
    const base = at(car.cab === "front" ? -hl * 0.35 : hl * 0.35, 0, roofZ);
    g.strokeStyle = "#1d181b";
    g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(base.x - 2.6, base.y);
    g.lineTo(base.x, base.y - 3.4);
    g.lineTo(base.x + 2.6, base.y);
    g.moveTo(base.x - 3.4, base.y - 3.4);
    g.lineTo(base.x + 3.4, base.y - 3.4);
    g.stroke();
  }
}

// Baked atlases: 64 headings in an 8 × 8 grid, frame 0 facing east, clockwise.
// When ringTrainTurns and ringTrainCabTurns are registered in assets.js, copy the body
// length (px at frame scale) and the frame's rail-contact point from art-src/baked/ringTrain.json.
const atlasMeta = { bodyLength: undefined, anchor: undefined };
function drawAtlasCar(car, lift) {
  const meta = atlasMeta;
  const atlas = car.cab ? artwork.ringTrainCabTurns : artwork.ringTrainTurns;
  // The rear cab is the same car turned round.
  const heading = car.cab === "rear" ? car.a + Math.PI : car.a;
  const angle = ((heading % TAU) + TAU) % TAU,
    frame = Math.round((angle / TAU) * 64) % 64,
    cell = atlas.width / 8,
    scale = (meta.bodyLength ?? cell * 0.8) / CAR_LENGTH,
    [ax, ay] = meta.anchor ?? [cell / 2, cell * 0.656];
  g.drawImage(atlas, (frame % 8) * cell, Math.floor(frame / 8) * cell, cell, cell, car.x - ax / scale, car.y - lift - ay / scale, cell / scale, cell / scale);
}

function drawCarriage(car, lift, state) {
  if (artwork.ringTrainTurns && artwork.ringTrainCabTurns) drawAtlasCar(car, lift);
  else drawPlaceholderCar(car, lift, state);
}

// Until the town paints the ring viaduct, a plain iron deck on piers carries the trains.
let fallbackGeometry;
function offsetLine(points, d) {
  return points.map((q, i) => {
    const a = points[(i - 1 + points.length) % points.length],
      b = points[(i + 1) % points.length],
      l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: q.x - ((b.y - a.y) / l) * d, y: q.y + ((b.x - a.x) / l) * d };
  });
}
function fallback() {
  if (fallbackGeometry) return fallbackGeometry;
  const { ring } = ringLine();
  const piers = [];
  for (let s = 0; s < ring.length; s += 46) {
    const q = ring.pointAt(s);
    if (blockedIn(town, q.x, q.y, 5) && blockedIn(town, q.x, q.y + 6, 5)) piers.push({ ...q, pier: true });
  }
  fallbackGeometry = {
    piers,
    rails: [offsetLine(ring.points, -2.3), offsetLine(ring.points, 2.3)],
    edges: [offsetLine(ring.points, -6), offsetLine(ring.points, 6)],
  };
  return fallbackGeometry;
}
function strokeLoop(points, lift, width, colour, dash) {
  g.beginPath();
  for (const q of points) g.lineTo(q.x, q.y - lift);
  g.closePath();
  g.lineWidth = width;
  g.strokeStyle = colour;
  g.setLineDash(dash ?? []);
  g.stroke();
  g.setLineDash([]);
}
function drawFallbackDeck() {
  const { ring } = ringLine();
  const geo = fallback(),
    lift = ring.deckLift;
  g.save();
  g.lineJoin = "round";
  strokeLoop(ring.points, lift - 4.5, 11, "#1f2622");
  strokeLoop(ring.points, lift - 4.5, 9, "#3f5547", [1.2, 2.4]);
  strokeLoop(ring.points, lift, 12.5, "#34302f");
  strokeLoop(ring.points, lift, 7, "#251d1c", [0.9, 1.6]);
  for (const edge of geo.edges) strokeLoop(edge, lift, 0.9, "#6c8473");
  for (const rail of geo.rails) strokeLoop(rail, lift, 0.6, "#b5aaa0");
  // Platforms on the right of travel, with lamps.
  for (const st of ring.stations) {
    g.beginPath();
    for (let s = st.s - 112; s <= st.s + 112; s += 8) {
      const pose = ring.poseAt(s, 4);
      g.lineTo(pose.x - Math.sin(pose.a) * 9.5, pose.y + Math.cos(pose.a) * 9.5 - lift);
    }
    g.lineWidth = 6.5;
    g.strokeStyle = "#776c63";
    g.stroke();
    g.beginPath();
    for (let s = st.s - 112; s <= st.s + 112; s += 8) {
      const pose = ring.poseAt(s, 4);
      g.lineTo(pose.x - Math.sin(pose.a) * 6.6, pose.y + Math.cos(pose.a) * 6.6 - lift);
    }
    g.lineWidth = 0.7;
    g.strokeStyle = "#e2b84c";
    g.stroke();
    g.globalCompositeOperation = "lighter";
    for (let s = st.s - 100; s <= st.s + 100; s += 40) {
      const pose = ring.poseAt(s, 4);
      const x = pose.x - Math.sin(pose.a) * 10,
        y = pose.y + Math.cos(pose.a) * 10 - lift;
      const glow = g.createRadialGradient(x, y, 0, x, y, 9);
      glow.addColorStop(0, "#ffc86a40");
      glow.addColorStop(1, "#ffc86a00");
      g.fillStyle = glow;
      g.fillRect(x - 9, y - 9, 18, 18);
    }
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
}
function drawPier(q) {
  const { ring } = ringLine();
  const top = q.y - ring.deckLift + 5;
  g.fillStyle = "#15112560";
  g.beginPath();
  g.ellipse(q.x + 0.8, q.y, 4.2, 1.6, 0, 0, TAU);
  g.fill();
  const shaft = g.createLinearGradient(q.x - 2.2, 0, q.x + 2.2, 0);
  shaft.addColorStop(0, "#26322b");
  shaft.addColorStop(0.4, "#5e7765");
  shaft.addColorStop(1, "#1e2621");
  g.fillStyle = shaft;
  g.fillRect(q.x - 2.2, top, 4.4, q.y - top - 2);
  g.fillStyle = "#4e4744";
  g.fillRect(q.x - 3.2, q.y - 3, 6.4, 3);
  g.fillStyle = "#2f3d35";
  g.beginPath();
  g.moveTo(q.x - 2.2, top + 6);
  g.quadraticCurveTo(q.x - 2.2, top, q.x - 6, top);
  g.lineTo(q.x + 6, top);
  g.quadraticCurveTo(q.x + 2.2, top, q.x + 2.2, top + 6);
  g.fill();
}

// Station roundels at the stair feet, sorted with street actors.
function drawStationSign(st) {
  const { x, y } = st.street;
  g.fillStyle = "#15112570";
  g.beginPath();
  g.ellipse(x + 0.5, y, 2.4, 1, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#2a2f2b";
  g.fillRect(x - 0.45, y - 15, 0.9, 15);
  g.fillStyle = "#191825";
  g.beginPath();
  g.arc(x, y - 17.5, 3.9, 0, TAU);
  g.fill();
  g.fillStyle = "#f3e3bf";
  g.beginPath();
  g.arc(x, y - 17.5, 3.4, 0, TAU);
  g.fill();
  g.fillStyle = "#2f6b4f";
  g.beginPath();
  g.arc(x, y - 17.5, 2.6, 0, TAU);
  g.fill();
  g.fillStyle = "#f3e3bf";
  g.font = "bold 2.6px system-ui";
  g.textAlign = "center";
  g.fillText("PC", x, y - 16.5);
  g.textAlign = "left";
}

// Street-level pieces of the ring for the depth-sorted actor list.
export function ringActors(ox, oy) {
  const { ring } = ringLine();
  const out = [];
  const inView = (q, above = 0) => q.x > ox - 12 && q.x < ox + game.vw + 12 && q.y > oy - 4 && q.y - above < oy + game.vh + 4;
  for (const st of ring.stations)
    if (inView(st.street, 25)) out.push({ y: st.street.y, x: st.street.x, draw: () => drawStationSign(st) });
  if (ring.fallback)
    for (const q of fallback().piers) if (inView(q)) out.push({ y: q.y, x: q.x, draw: () => drawPier(q) });
  return out;
}

// The overhead layer: deck (when the town has none), the trains and anyone on a platform.
// Tall scenery standing in front of a carriage is painted again on top of it.
export function drawRingTrains(ox, oy, actors = []) {
  const { ring, tt } = ringLine();
  const lift = ring.deckLift;
  if (ring.fallback) drawFallbackDeck();
  const view = { left: ox - 40, right: ox + game.vw + 40, top: oy - 20, bottom: oy + game.vh + lift + 30 };
  const items = [];
  for (let k = 0; k < tt.sets; k++) {
    const state = trainsetAt(tt, k, game.time);
    state.doorsFor = state.station >= 0 ? tt.dwell - state.dwellLeft - tt.doorsOpen : 0;
    for (const car of carriagesOf(tt, state))
      if (car.x > view.left && car.x < view.right && car.y > view.top && car.y < view.bottom)
        items.push({ y: car.y, car, state });
  }
  if (game.transit?.phase === "platform") items.push({ y: p.y, rider: true });
  items.sort((a, b) => a.y - b.y);
  const tall = actors.filter((a) => a.prop && a.o.item.outline);
  for (const item of items) {
    if (item.rider) {
      g.save();
      g.translate(0, -lift);
      dude(p, true);
      g.restore();
      continue;
    }
    const car = item.car;
    drawCarriage(car, lift, item.state);
    // Scenery standing south of the carriage and reaching above the deck is painted
    // again, but only where it overlaps this carriage.
    const spanX = (CAR_LENGTH / 2) * Math.abs(Math.cos(car.a)) + CAR_HALF_WIDTH * Math.abs(Math.sin(car.a)) + 1,
      spanY = (CAR_LENGTH / 2) * Math.abs(Math.sin(car.a)) + CAR_HALF_WIDTH * Math.abs(Math.cos(car.a)) + 1,
      box = { left: car.x - spanX, right: car.x + spanX, top: car.y - lift - spanY - 18, bottom: car.y - lift + spanY + 2 };
    for (const a of tall) {
      const { item: prop } = a.o;
      const top = Math.min(...prop.outline.map((q) => q[1])) - prop.y + a.o.y;
      if (a.o.y <= car.y || top >= box.bottom || Math.abs(a.o.x - car.x) > spanX + 8) continue;
      g.save();
      g.beginPath();
      g.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      g.clip();
      drawStreetProp(a.o);
      g.restore();
    }
  }
}

// The ring and its stations on the city map; trains too on the full sheet.
export function drawRingMap(left, top, scale, full) {
  const { ring, tt } = ringLine();
  g.save();
  g.beginPath();
  for (const q of ring.points) g.lineTo(left + q.x * scale, top + q.y * scale);
  g.closePath();
  g.lineJoin = "round";
  g.lineWidth = full ? 1.6 : 0.6;
  g.strokeStyle = "#1d1b26";
  g.stroke();
  g.lineWidth = full ? 0.9 : 0.34;
  g.strokeStyle = "#6fae8a";
  g.stroke();
  if (full)
    for (let k = 0; k < tt.sets; k++) {
      const state = trainsetAt(tt, k, game.time);
      for (const car of carriagesOf(tt, state)) {
        g.fillStyle = "#b8343c";
        g.beginPath();
        g.arc(left + car.x * scale, top + car.y * scale, 0.75, 0, TAU);
        g.fill();
      }
    }
  for (const st of ring.stations) {
    const x = left + st.stop.x * scale,
      y = top + st.stop.y * scale,
      r = full ? 1.7 : 0.7;
    g.fillStyle = "#191825";
    g.beginPath();
    g.arc(x, y, r + (full ? 0.5 : 0.25), 0, TAU);
    g.fill();
    g.fillStyle = "#f3e3bf";
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
  g.restore();
}

export { platformSpot };
