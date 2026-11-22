// La Petite Ceinture on screen: carriages on the town's ring viaduct, station
// signs at the stair feet, and the ring on the city map.
import { artwork, game, p } from "../core/state.js";
import { g } from "../platform/canvas.js";
import { drawStreetProp } from "../world/streets.js";
import { dude } from "./pedestrians.js";
import { ringLine } from "../game/transit.js";
import { CAR_HALF_WIDTH, CAR_LENGTH, carriagesOf, platformSpot, trainsetAt, TAU } from "../game/ring-route.js";

const mod = (a, n) => ((a % n) + n) % n;

// Fable's baked atlases (art-src/baked/ringTrain.json, ringTrainCab.json): 64 headings in
// an 8 × 8 grid of 320 px frames, frame 0 facing east, clockwise; 3.6 px per world unit;
// the point under the middle of the carriage at rail level sits at (160, 192) in its frame.
const FRAME = 320,
  PX_PER_UNIT = 3.6,
  ORIGIN = [160, 192],
  TILT = 0.78;

function quad(points, fill) {
  g.beginPath();
  for (const q of points) g.lineTo(q.x, q.y);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function drawCarriage(car, lift, state) {
  const ux = Math.cos(car.a),
    uy = Math.sin(car.a),
    nx = -uy,
    ny = ux;
  const hl = CAR_LENGTH / 2 - 1,
    hw = CAR_HALF_WIDTH;
  const at = (u, v) => ({ x: car.x + ux * u + nx * v, y: car.y + uy * u + ny * v - lift });
  // Contact shadow on the deck, cast slightly south-east as by the street lamps.
  quad([at(-hl, -hw + 0.6), at(hl, -hw + 0.6), at(hl + 1.2, hw + 1.6), at(-hl + 1.2, hw + 1.6)], "#0b0812a0");
  // Window light spills on the platform side, brighter where the doors stand open.
  const side = state.station >= 0 ? ringLine().ring.stations[state.station].side : 1;
  g.save();
  g.globalCompositeOperation = "lighter";
  quad([at(-hl + 6, side * hw), at(hl - 6, side * hw), at(hl - 9, side * (hw + 6)), at(-hl + 9, side * (hw + 6))], "#ff9a3212");
  if (state.doors) {
    const open = Math.min(1, (state.doorsFor ?? 1) * 2.5);
    for (const u of [-0.3 * CAR_LENGTH, 0.3 * CAR_LENGTH]) {
      const q = at(u, side * (hw + 3));
      const glow = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, 9);
      glow.addColorStop(0, `rgba(255,214,140,${0.42 * open})`);
      glow.addColorStop(1, "rgba(255,214,140,0)");
      g.fillStyle = glow;
      g.fillRect(q.x - 9, q.y - 9, 18, 18);
    }
  }
  if (car.cab === "front") {
    const nose = at(hl, 0);
    const beam = g.createRadialGradient(nose.x, nose.y, 0, nose.x, nose.y, 46);
    beam.addColorStop(0, "#ffe2a048");
    beam.addColorStop(1, "#ffe2a000");
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(at(hl, -3).x, at(hl, -3).y);
    g.lineTo(at(hl + 46, -11).x, at(hl + 46, -11).y);
    g.lineTo(at(hl + 46, 11).x, at(hl + 46, 11).y);
    g.lineTo(at(hl, 3).x, at(hl, 3).y);
    g.fill();
  }
  g.restore();
  // The rear cab is the cab car turned round, its driving end facing back.
  const atlas = car.cab ? artwork.ringTrainCabTurns : artwork.ringTrainTurns;
  const heading = mod(car.cab === "rear" ? car.a + Math.PI : car.a, TAU),
    frame = Math.round((heading / TAU) * 64) % 64,
    cell = atlas.width / 8,
    unit = (cell / FRAME) * PX_PER_UNIT;
  g.save();
  g.translate(car.x, car.y - lift);
  // Between two of the 64 baked headings, turn the nearer one the rest of the way.
  g.rotate(Math.sin(heading - (frame * TAU) / 64) * TILT);
  g.drawImage(
    atlas,
    (frame % 8) * cell,
    Math.floor(frame / 8) * cell,
    cell,
    cell,
    -ORIGIN[0] / PX_PER_UNIT,
    -ORIGIN[1] / PX_PER_UNIT,
    cell / unit,
    cell / unit,
  );
  g.restore();
}

// Station roundels at the side-leg stair feet, sorted with street actors.
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

// Street-level pieces of the ring for the depth-sorted actor list. On the north and south legs
// the painted station hall marks the stair foot; on the side legs a roundel does.
export function ringActors(ox, oy) {
  const { ring } = ringLine();
  const out = [];
  const inView = (q, above = 0) => q.x > ox - 12 && q.x < ox + game.vw + 12 && q.y > oy - 4 && q.y - above < oy + game.vh + 4;
  for (const st of ring.stations)
    if (st.vertical && inView(st.street, 25)) out.push({ y: st.street.y, x: st.street.x, draw: () => drawStationSign(st) });
  return out;
}

// The overhead layer: the trains on the town's ring viaduct and anyone on a platform.
// Tall scenery standing in front of a carriage is painted again on top of it.
export function drawRingTrains(ox, oy, actors = []) {
  const { ring, tt } = ringLine();
  const lift = ring.deckLift;
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
