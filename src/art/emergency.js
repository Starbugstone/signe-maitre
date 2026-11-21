import { g } from "../platform/canvas.js";
import { artwork, clamp, game } from "../core/state.js";
import { drawDamageSmoke, shadow } from "./vehicles.js";
import { TAU } from "../world/town.js";

// Angles use the same screen-space axes as the sedan: +x is east and +y is south.
function rescueFacing(dx, dy) {
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 1) : dy >= 0 ? 2 : 3;
}
function drawCrew(crew, v) {
  const returning = v.patient.onStretcher,
    sign = returning ? -1 : 1;
  const facing =
    v.state === "loading"
      ? rescueFacing(v.dx, v.dy)
      : rescueFacing(sign * (v.patient.x - v.apron.x), sign * (v.patient.y - v.apron.y));
  const walking = (v.crew > 0 && v.crew < 1) || v.state === "loading";
  g.save();
  g.translate(crew.x, crew.y);
  if (v.state === "loading") g.globalAlpha = clamp((1.05 - v.clock) / 0.38, 0, 1);
  if (returning) {
    // The painted medic and loaded trolley share a frame so the hands stay on the rail.
    const frame = walking ? Math.floor(v.clock * 5) % 2 : 0;
    shadow(0, 0, facing < 2 ? 7.7 : 3.3, facing < 2 ? 1.8 : 3.0);
    g.drawImage(artwork.rescueStretcher, facing * 230, frame * 200, 230, 200, -11.5, -19.5, 23, 20);
  } else {
    const row = facing < 2 ? 0 : facing === 2 ? 1 : 2,
      step = walking ? Math.floor(v.clock * 7) % 4 : 0;
    shadow(0, 0, 2.5, 1.05);
    if (facing === 1) g.scale(-1, 1);
    g.drawImage(artwork.rescueMedic, step * 104, row * 148, 104, 148, -5.2, -14.5, 10.4, 14.8);
  }
  g.restore();
}
// Lens centres are registered to the beacons in each of the four painted van views.
const rescueBeaconCentres = [
  [
    [-9.04, -13.51],
    [4.87, -13.51],
  ],
  [
    [-4.93, -13.51],
    [9.25, -13.51],
  ],
  [
    [-2.91, -12.3],
    [2.7, -12.3],
  ],
  [
    [-2.91, -12.3],
    [2.7, -12.3],
  ],
];
function drawAmbulance(v) {
  const facing = rescueFacing(v.dx, v.dy),
    horizontal = facing < 2;
  const flash = (1 + Math.sin(game.time * 12)) * 0.5;
  g.save();
  g.translate(v.x, v.y);
  if (v.condition > 0) {
    g.save();
    g.rotate(v.a);
    const beam = g.createRadialGradient(11, 0, 0, 22, 0, 20);
    beam.addColorStop(0, "#ffd78242");
    beam.addColorStop(1, "#ffd78200");
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(9, -4);
    g.lineTo(39, -9);
    g.lineTo(39, 9);
    g.lineTo(9, 4);
    g.fill();
    g.restore();
  }
  g.save();
  g.rotate(v.a);
  shadow(0, 0.6, 13.8, 4.8);
  g.restore();
  const manual = v.state === "parked" || v.condition < 65;
  let beacons = rescueBeaconCentres[facing];
  if (manual) {
    const angle = ((v.a % TAU) + TAU) % TAU,
      frame = Math.round((angle / TAU) * 64) % 64;
    const atlas =
      v.condition === 0
        ? artwork.ambulanceWreck
        : v.condition < 65
          ? artwork.ambulanceDented
          : artwork.ambulanceTurns;
    const cell = atlas.width / 8,
      scale = 5.65;
    g.save();
    g.rotate(Math.sin(angle - (frame * TAU) / 64) * 0.72);
    g.drawImage(
      atlas,
      (frame % 8) * cell,
      Math.floor(frame / 8) * cell,
      cell,
      cell,
      -96 / scale,
      -126 / scale,
      192 / scale,
      192 / scale,
    );
    g.restore();
    beacons = [-9, 5].map((u) => [
      u * Math.cos(angle),
      u * Math.sin(angle) * 0.78 - (v.condition < 65 ? 10.35 : 12.8),
    ]);
  } else {
    const body = v.state === "collecting" || v.state === "loading" ? artwork.rescueOpen : artwork.rescueVan;
    g.drawImage(
      body,
      (facing % 2) * 288,
      Math.floor(facing / 2) * 288,
      288,
      288,
      -144 / 8.5,
      -144 / 8.5,
      288 / 8.5,
      288 / 8.5,
    );
  }
  if (v.condition > 0)
    for (const [i, [x, y]] of beacons.entries()) {
      const brightness = (i ? 1 - flash : flash) ** 3;
      const halo = g.createRadialGradient(x, y, 0, x, y, 2.5);
      halo.addColorStop(0, "rgba(185,234,255," + 0.85 * brightness + ")");
      halo.addColorStop(0.35, "rgba(89,170,255," + 0.54 * brightness + ")");
      halo.addColorStop(1, "rgba(75,155,255,0)");
      g.fillStyle = halo;
      g.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
  g.restore();
  drawDamageSmoke(v);
}

function dazedStars(n) {
  for (let i = 0; i < 3; i++) {
    const phase = game.time * 2.8 + (i * TAU) / 3,
      x = n.x + Math.cos(phase) * 4.4,
      y = n.y - 10.5 + Math.sin(phase) * 1.05;
    g.save();
    g.translate(x, y);
    g.rotate(phase * 0.55);
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5,
        r = k % 2 ? 0.66 : 1.65;
      if (k) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.strokeStyle = "#392238";
    g.lineWidth = 0.55;
    g.stroke();
    g.fillStyle = "#ffdd65";
    g.fill();
    g.restore();
  }
}
function crowdPose(n, column) {
  const row = n.look === "worker" ? 0 : n.look === "lady" ? 1 : 2;
  if (Math.cos(n.a) < 0) g.scale(-1, 1);
  g.drawImage(artwork.scuffle, column * 152, row * 132, 152, 132, -8, -13.7, 16, 14);
}

export { crowdPose, dazedStars, drawAmbulance, drawCrew };
