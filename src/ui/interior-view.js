// The room the player is in, drawn over the whole view; see src/game/interior.js.
import { artwork, game, p } from "../core/state.js";
import { g, hud, $, rect } from "../platform/canvas.js";
import { dude } from "../art/pedestrians.js";
import { interior, indoorAction } from "../game/interior.js";
import { t } from "./dialogs.js";
import { arrivalMarker } from "./waypoint.js";

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
