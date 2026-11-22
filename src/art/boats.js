import { boatFrames } from "./assets.js";
import { artwork, game } from "../core/state.js";
import { boatFleet, river } from "../game/boats.js";
import { g } from "../platform/canvas.js";
import { TAU } from "../world/town.js";

const paint = {
  barge: { side: "#693b44", trim: "#aa6e57", deck: "#716355", cabin: "#ac8370" },
  riverboat: { side: "#3d5860", trim: "#b6a183", deck: "#9b806a", cabin: "#c1a587" },
  speedboat: { side: "#805357", trim: "#c49c72", deck: "#b1a78c", cabin: "#665d70" },
  launch: { side: "#253d50", trim: "#aa8552", deck: "#57666c", cabin: "#949e91" },
};

function shape(points, fill, outline = "#281d2a", weight = 0.5) {
  g.beginPath();
  for (const [x, y] of points) g.lineTo(x, y);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (outline) {
    g.strokeStyle = outline;
    g.lineWidth = weight;
    g.stroke();
  }
}

function paintedHull(boat) {
  const L = boat.halfLength, B = boat.halfWidth;
  const co = Math.cos(boat.a), si = Math.sin(boat.a);
  const colors = paint[boat.model];
  const workboat = boat.model === "barge";
  const passenger = boat.model === "riverboat";
  const gunwale = (workboat || passenger ? 0.52 : 0.45) * B;
  const project = (u, v, z) => [u * co - v * si, u * si + v * co - z - boat.plane * (1 + u / L) * 1.35];
  const outline = [[L, 0], [L * 0.87, B * 0.62], [L * 0.62, B], [-L * 0.81, B], [-L, B * 0.67],
    [-L, -B * 0.67], [-L * 0.81, -B], [L * 0.62, -B], [L * 0.87, -B * 0.62]];
  const deck = outline.map(([u, v]) => project(u, v, gunwale));
  const keel = outline.map(([u, v]) => project(u * 0.97, v * 0.85, 0));
  for (let i = 0; i < deck.length; i++) {
    const j = (i + 1) % deck.length;
    if (deck[j][0] <= deck[i][0]) shape([deck[i], deck[j], keel[j], keel[i]], colors.side);
  }

  const gloss = g.createLinearGradient(0, -B - gunwale, 0, B);
  gloss.addColorStop(0, colors.trim);
  gloss.addColorStop(0.48, colors.deck);
  gloss.addColorStop(1, "#524650");
  shape(deck, gloss, "#201b26", 0.85);
  shape(outline.map(([u, v]) => project(u * 0.972, v * 0.87, gunwale)), "#85735b32", colors.trim, 0.36);
  for (let i = 0; i < 19; i++) {
    const u = L * (i / 11 - 0.85), v = B * Math.sin(i * 45.3) * 0.53;
    shape([project(u, v, gunwale + 0.03), project(u + L * 0.04, v + 0.2, gunwale + 0.03),
      project(u - 0.1, v + 0.5, gunwale + 0.03)], "#e4b88735", null);
  }

  function cabin(back, nose, width, height, windows) {
    const z = gunwale + height;
    const floor = [[nose, width], [back, width], [back, -width], [nose, -width]];
    const lower = floor.map(([u, v]) => project(u, v, gunwale));
    const wallTop = floor.map(([u, v]) => project(u, v * 0.91, z));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if (lower[j][0] > lower[i][0]) continue;
      shape([wallTop[i], wallTop[j], lower[j], lower[i]], i % 2 ? colors.cabin : colors.trim);
      const count = i % 2 ? 2 : windows;
      for (let k = 0; k < count; k++) {
        const lerp = (a, b, t) => a.map((v, n) => v + (b[n] - v) * t);
        const f = (k + 0.16) / count, e = (k + 0.83) / count;
        const low = (t) => lerp(lerp(lower[i], lower[j], t), lerp(wallTop[i], wallTop[j], t), 0.24);
        const high = (t) => lerp(lerp(lower[i], lower[j], t), lerp(wallTop[i], wallTop[j], t), 0.79);
        shape([low(f), low(e), high(e), high(f)], i % 2 ? "#445763" : "#c69b65", "#342832", 0.32);
      }
    }
    shape(wallTop, colors.cabin, "#362832", 0.72);
    shape(floor.map(([u, v]) => project(u * 0.98 + (back + nose) * 0.01, v * 0.73, z + 0.15)),
      "#eab47d43", "#403642", 0.28);
  }

  if (workboat) {
    cabin(-L * 0.81, -L * 0.48, B * 0.7, B * 0.85, 3);
    const hatch = [[-L * 0.42, -B * 0.76], [L * 0.58, -B * 0.76], [L * 0.58, B * 0.76], [-L * 0.42, B * 0.76]];
    shape(hatch.map(([u, v]) => project(u, v, gunwale + 1.4)), "#554953", colors.trim);
    for (let i = 0; i < 8; i++) {
      const u = L * (i / 8 - 0.4);
      shape([[u, -0.72], [u + 1.5, -0.72], [u + 1.5, 0.72], [u, 0.72]]
        .map(([s, v]) => project(s, v * B, gunwale + 1.6)), "#9d7761", null);
    }
  } else if (passenger) {
    cabin(-L * 0.68, L * 0.54, B * 0.77, B * 0.86, 11);
  } else {
    cabin(-L * 0.4, L * 0.25, B * 0.78, B * (boat.model === "launch" ? 0.94 : 0.55), 3);
  }
  if (boat.condition < 92) {
    for (const side of [-1, 1]) {
      shape([[0.75, 0.58], [0.52, 0.72], [0.65, 0.5], [0.55, 0.38]].map(([u, v]) =>
        project(u * L, v * B * side, gunwale + 0.12)), "#44383e");
    }
  }

  for (const side of [-1, 1]) {
    const [x, y] = project(L * 0.62, B * 0.78 * side, gunwale + 0.55);
    g.fillStyle = side > 0 ? "#8bcbab" : "#ec9276";
    g.beginPath();
    g.ellipse(x, y, 0.7, 0.55, 0, 0, TAU);
    g.fill();
  }
}

function drawWake(boat) {
  const beam = boat.halfWidth;
  for (const p of boat.wake) {
    const fade = 1 - p.age / 2.4;
    const spread = beam * (0.45 + p.age * 0.42) + p.power * p.age * 2.1;
    const angleX = Math.cos(p.a), angleY = Math.sin(p.a);
    for (const side of [-1, 1]) {
      const x = p.x - angleY * spread * side, y = p.y + angleX * spread * side;
      const endX = x - (1 + p.power * 5) * angleX, endY = y - (1 + p.power * 5) * angleY;
      if (!river.onWater(x, y, 1.3) || !river.onWater(endX, endY, 1.3)) continue;
      g.strokeStyle = side === 1 ? "#accdcc" : "#79aebc";
      g.globalAlpha = 0.34 * fade * p.power;
      g.lineWidth = 0.55 + fade * p.power * 0.55;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(endX, endY);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}

function drawBoat(boat) {
  g.save();
  g.translate(boat.x, boat.y);
  g.save();
  g.rotate(boat.a);
  g.fillStyle = "#10132482";
  g.beginPath();
  g.ellipse(0, 1, boat.halfLength * 1.015, boat.halfWidth * 0.99, 0, 0, TAU);
  g.fill();
  g.restore();
  for (let i = 0; i < 12; i++) {
    const y = boat.halfWidth * 0.4 + i * 1.1;
    const x = Math.sin(boat.x + i * 4.2 + game.time * 3) * (1 + i * 0.18);
    if (!river.onWater(boat.x + x, boat.y + y, 2)) continue;
    g.fillStyle = i % 4 ? "#e8b471" : "#aedaaf";
    g.globalAlpha = (1 - i / 12) * 0.36;
    g.fillRect(x - (i % 3), y, 2 + (i % 5), 0.35 + (i % 2) * 0.25);
  }
  g.globalAlpha = 1;
  const atlas = artwork[boat.model + "Turns"], metadata = boatFrames[boat.model];
  if (atlas && metadata) {
    const cell = atlas.width / 8, frame = (Math.round(boat.a * 64 / TAU) % 64 + 64) % 64;
    const scale = boat.halfLength * 2 / metadata.bodyLengthPx;
    g.drawImage(atlas, frame % 8 * cell, Math.floor(frame / 8) * cell, cell, cell,
      -scale * metadata.anchorX, -scale * metadata.anchorY - boat.plane * 1.35, cell * scale, cell * scale);
  } else paintedHull(boat);
  g.restore();
}

export function drawBoats(left, top) {
  const visible = boatFleet.boats.filter((b) => !b.incoming &&
    b.x + b.halfLength + 130 >= left && b.x - b.halfLength - 130 <= left + game.vw &&
    b.y + 115 >= top && b.y - 115 <= top + game.vh);
  for (const boat of visible) drawWake(boat);
  visible.sort((a, b) => a.y - b.y);
  for (const boat of visible) drawBoat(boat);
  return visible.length > 0;
}

export function drawMooring(m) {
  const { x, y } = m.quay;
  g.save();
  g.translate(x, y);
  g.fillStyle = "#282331";
  g.beginPath();
  g.ellipse(0, 0, 3.6, 2.7, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "#edcc86";
  g.lineWidth = 0.48;
  g.stroke();
  g.beginPath();
  g.moveTo(-1.55, -0.15);
  g.quadraticCurveTo(0, 2.55, 1.55, -0.15);
  g.moveTo(0, 1.2);
  g.lineTo(0, -1.5);
  g.moveTo(-0.85, -0.65);
  g.lineTo(0.85, -0.65);
  g.stroke();
  g.restore();
}
