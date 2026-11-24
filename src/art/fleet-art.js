import { g } from "../platform/canvas.js";
import { artwork, game } from "../core/state.js";
import { fleetOf } from "../game/fleet.js";
import { TAU } from "../world/town.js";
import { drawCar, drawDamageSmoke } from "./vehicles.js";

// Every fleet vehicle with a baked atlas: 64 headings in an 8 × 8 sheet, one sheet per
// state, all painted from the same elevated camera as the ambulance. The sedan keeps
// its own run-time wrap.
const headings = 64;

function headlights(v, spec) {
  const nose = spec.halfLength - 3,
    spread = Math.min(3, spec.halfWidth * 0.62);
  g.save();
  g.translate(v.x, v.y);
  g.rotate(v.a);
  const light = g.createRadialGradient(nose + 1, 0, 0, nose + 7, 0, 23);
  light.addColorStop(0, "#ffce7240");
  light.addColorStop(1, "#ffd67c00");
  g.fillStyle = light;
  g.beginPath();
  g.moveTo(nose, -spread);
  g.lineTo(nose + 29, -spread - 5);
  g.lineTo(nose + 29, spread + 5);
  g.lineTo(nose, spread);
  g.fill();
  g.restore();
}
function groundShadow(v, spec) {
  g.save();
  g.translate(v.x + 0.65, v.y + 0.9);
  g.rotate(v.a);
  g.fillStyle = "#17132183";
  g.beginPath();
  // A long flat-sided body throws a squarer shadow than a car.
  if (spec.halfLength > 15) g.roundRect(-spec.halfLength - 0.5, -spec.halfWidth - 0.2, spec.halfLength * 2 + 1, spec.halfWidth * 2 + 0.4, 2.4);
  else g.ellipse(0, 0, spec.halfLength + 0.45, spec.halfWidth + 0.1, 0, 0, TAU);
  g.fill();
  g.restore();
}
// Stands in until a model's atlas is baked: a plain body of the right size.
function placeholder(v, spec) {
  g.save();
  g.translate(v.x, v.y);
  g.rotate(v.a);
  g.fillStyle = "#33252b";
  g.fillRect(-spec.halfLength, -spec.halfWidth, spec.halfLength * 2, spec.halfWidth * 2);
  g.fillStyle = v.condition === 0 ? "#4d4047" : "#8d7f86";
  g.fillRect(-spec.halfLength + 0.6, -spec.halfWidth + 0.6, spec.halfLength * 2 - 1.2, spec.halfWidth * 2 - 1.2);
  g.fillStyle = "#3c4a5c";
  g.fillRect(spec.halfLength * 0.25, -spec.halfWidth + 1.1, spec.halfLength * 0.3, spec.halfWidth * 2 - 2.2);
  g.restore();
}
// The sheet for the vehicle's state, and how many headings it holds.
function sheetFor(v, spec) {
  // A model painted in more than one colour picks its sheets by the vehicle's tint.
  const atlas = { ...spec.atlas, ...spec.tints?.[v.tint] };
  if (v.condition === 0) return [artwork[atlas.wreck], headings];
  // A two-wheeler shows its rider while someone is on it: the bailiff, or a courier in traffic.
  if (atlas.ridden && (v.route || v === game.ride)) {
    const sheet = artwork[v === game.ride ? atlas.ridden : atlas.courier];
    if (sheet) return [sheet, atlas.riddenHeadings];
  }
  return [artwork[v.condition < 65 ? atlas.dented : atlas.intact] || artwork[atlas.intact], headings];
}
// The sheets a vehicle may show soon: the one for its state and the next state of damage, and
// every rider sheet of a two-wheeler. The ride the player is in may be wrecked at any moment.
export function vehicleSheets(v) {
  const spec = fleetOf(v);
  if (!spec.atlas) return ["motor"];
  const atlas = { ...spec.atlas, ...spec.tints?.[v.tint] };
  const states = v === game.ride ? [atlas.intact, atlas.dented, atlas.wreck] : v.condition === 0 ? [atlas.wreck] : v.condition < 65 ? [atlas.dented, atlas.wreck] : [atlas.intact, atlas.dented];
  if (atlas.ridden) states.push(atlas.ridden, atlas.courier);
  return states.filter(Boolean);
}
function drawVehicle(v) {
  const spec = fleetOf(v);
  if (!spec.atlas) return drawCar(v);
  if (v.condition !== 0 && (v === game.ride || v.route)) headlights(v, spec);
  groundShadow(v, spec);
  const [sheet, count] = sheetFor(v, spec);
  if (!sheet) placeholder(v, spec);
  else {
    const angle = ((v.a % TAU) + TAU) % TAU,
      frame = Math.round((angle / TAU) * count) % count;
    const columns = Math.sqrt(count),
      cell = sheet.width / columns,
      { frame: size, scale, cx, cy } = spec.sprite;
    g.save();
    g.translate(v.x, v.y);
    // Between two baked headings the picture turns the last degree or two itself.
    let turn = Math.sin(angle - (frame * TAU) / count) * 0.72;
    if (spec.leans && v.lean && count !== headings) {
      // Banked into a turn: the picture tips about the tyres, seen across the road, and
      // shortens or lengthens as the rider leans toward or away from the camera.
      const bank = 0.3 * v.lean;
      turn -= bank * Math.sin(angle);
      const tip = bank * Math.cos(angle);
      g.scale(1, Math.cos(tip) - 0.78 * Math.sin(tip));
    }
    g.rotate(turn);
    g.drawImage(sheet, (frame % columns) * cell, Math.floor(frame / columns) * cell, cell, cell, -cx / scale, -cy / scale, size / scale, size / scale);
    g.restore();
  }
  drawDamageSmoke(v, spec.halfLength * 0.64);
}

export { drawVehicle };
