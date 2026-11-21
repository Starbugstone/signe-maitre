import { dist, game, p } from "../core/state.js";
import { target } from "../world/population.js";
import { $, hud } from "../platform/canvas.js";
import { t } from "./dialogs.js";
import { placeName } from "../game/cases.js";

function atObjective(end) {
  return dist(end, p) < (end === target ? 22 : 36);
}
function routeInstruction(end) {
  const near = atObjective(end);
  if (game.ride?.condition === 0 || (!game.ride && near && end === target && target.condition === 0))
    return "callRecovery";
  if (!game.active) return near ? "openFile" : "visitPickup";
  if (game.active === "repo")
    return game.ride === target
      ? near
        ? "handOver"
        : "driveAuction"
      : near
        ? game.ride
          ? "switchToTarget"
          : "boardTarget"
        : "northBoulevard";
  if (game.stage === "deliver") return near ? "handOver" : "driveAuction";
  if (near) return game.ride ? "leaveVehicle" : game.active === "noise" ? "useMeter" : "inventoryHere";
  return "goAddress";
}
function routeHUD(end) {
  const card = $("#routeCard");
  card.hidden = !end || game.viewMap;
  if (card.hidden) return;
  const id = end === target ? "target" : end.id,
    near = atObjective(end),
    compass = $("#compass");
  const bearing = Math.atan2(end.y - p.y, end.x - p.x);
  compass.style.transform = near ? "none" : "rotate(" + bearing + "rad)";
  hud("#compass", near ? "●" : "➜");
  hud("#routeType", game.active ? t(game.active) : t("nextCase") + " · " + t(id));
  hud("#routePlace", placeName(id));
  hud("#routeDistance", near ? t("onSite") : Math.round(dist(p, end) * 0.15) + " m");
  hud("#routeAction", t(routeInstruction(end)));
}

export { routeHUD };
