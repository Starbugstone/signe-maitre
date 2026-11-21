import { town } from "../world/town.js";
import { artwork, game, held, p, clamp, dist } from "../core/state.js";
import { walkVector } from "../core/controls.js";
import { g, hud, $, rect } from "../platform/canvas.js";
import { dude } from "../art/pedestrians.js";
import { t } from "../ui/dialogs.js";
import { arrivalMarker } from "../ui/waypoint.js";
import { footfall } from "../audio/mixer.js";

export let interior = null;
export function enterInterior(id) {
  const room = town.rooms.get(id);
  if (!room || game.ride || interior) return;
  interior = { room, returnTo: { x: p.x, y: p.y, a: p.a } };
  Object.assign(p, room.entry, { a: -Math.PI / 2, moving: false });
  held.clear();
  game.flash = 0;
}
export function leaveInterior() {
  if (!interior) return;
  Object.assign(p, interior.returnTo, { moving: false });
  interior = null;
  held.clear();
  game.camX = p.x;
  game.camY = p.y;
}
export function indoorAction() {
  if (!interior) return null;
  const room = interior.room;
  if (dist(p, room.exit) < 11) return "leaveRoom";
  if (dist(p, room.desk) < 15) return room.action;
  return null;
}
export function updateInterior(dt) {
  const [dx, dy] = walkVector();
  const x = p.x,
    y = p.y,
    mag = Math.hypot(dx, dy),
    floor = interior.room.floor;
  if (mag) {
    const step = (dt * (held.has("run") ? 48 : 24)) / Math.max(1, mag);
    p.a = Math.atan2(dy, dx);
    p.x = clamp(x + dx * step, floor.left, floor.right);
    p.y = clamp(y + dy * step, floor.top, floor.bottom);
  }
  const travelled = Math.hypot(p.x - x, p.y - y),
    last = p.walkDistance || 0;
  p.moving = travelled > 0.005;
  p.walkDistance = last + travelled;
  if (Math.floor(last / 6.8) !== Math.floor(p.walkDistance / 6.8)) footfall(Math.floor(p.walkDistance / 6.8));
}
export function drawInterior(anchor) {
  const { room } = interior,
    scale = Math.min(game.vw / room.width, game.vh / room.height);
  const left = (game.vw - room.width * scale) / 2,
    top = (game.vh - room.height * scale) / 2;
  rect(g, 0, 0, game.vw, game.vh, "#171420");
  g.save();
  g.translate(left, top);
  g.scale(scale, scale);
  g.drawImage(artwork[room.image], 0, 0, room.width, room.height);
  dude(p, true);
  if (anchor) arrivalMarker(anchor);
  g.restore();
  hud("#district", t(room.door) + " / Port-Fer");
  hud("#hint", t(indoorAction() || "officeFloor"));
  $("#reportBtn").hidden = true;
}
