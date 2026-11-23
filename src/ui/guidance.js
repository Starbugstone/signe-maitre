import { dist, done, game, p } from "../core/state.js";
import { target } from "../world/population.js";
import { $, hud } from "../platform/canvas.js";
import { lang, t } from "./dialogs.js";
import { files, nextFile, objective, placeName } from "../game/cases.js";
import { town } from "../world/town.js";
import { currentTrip, tripOptions } from "./travel.js";

function atObjective(end, room) {
  if (room) return dist(p, end) < (game.active ? 11 : 15);
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
        ? "handOverCar"
        : "deliverCar"
      : near
        ? game.ride
          ? "switchToTarget"
          : "boardTarget"
        : "northBoulevard";
  if (game.stage === "deliver") return near ? "handOver" : "driveAuction";
  if (near) return game.ride ? "leaveVehicle" : game.active === "noise" ? "useMeter" : "inventoryHere";
  return game.active === "noise" ? "record" : "tagLot";
}

function routeHUD(end, room) {
  const card = $("#routeCard");
  card.hidden = !end || game.viewMap;
  if (card.hidden) return;
  const file = game.active || nextFile();
  const near = atObjective(end, room);
  const step = room
    ? game.active ? (near ? "leaveRoom" : "exitRoute") : (near ? "caseDesk" : "deskRoute")
    : routeInstruction(end);
  hud("#routeType", t(game.active ? "currentCase" : "nextCase"));
  hud("#routeTitle", t(file));
  hud("#routeBrief", t(file + "Summary"));
  hud("#routePlace", placeName(room ? room.door : end === target ? "target" : end.id));
  hud("#routeDistance", near ? t("onSite") : room ? "" : Math.round(dist(p, end) * 0.15) + " m");
  hud("#routeAction", t(step));
}

let sheetLanguage;
function showMapSheet(end, origin) {
  const sheet = $("#mapSheet");
  if (!sheet.hidden && sheetLanguage === lang) return;
  sheet.hidden = false;
  sheetLanguage = lang;
  hud("#mapTitle", t("cityMap"));
  hud("#mapKey span:first-child", t("legend1"));
  hud("#mapKey span:last-child", t("legend2"));
  hud("#tripPrompt", t("travelLegend"));
  const options = tripOptions(origin);
  const selected = currentTrip()?.kind;
  for (const [kind, symbol, key] of [
    ["bike", "▲", "travelBike"], ["mooring", "■", "travelBoat"], ["station", "●", "travelTrain"],
  ]) {
    const button = $(`[data-trip="${kind}"]`);
    const active = selected === kind;
    const marker = document.createElement("b");
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = symbol;
    button.replaceChildren(marker, " " + t(active ? "travelClear" : key));
    button.disabled = !options[kind] && !active;
    button.setAttribute("aria-pressed", String(active));
  }
  hud("#filesTitle", t("casebook"));
  const list = $("#fileList");
  list.replaceChildren();
  const open = files.filter((id) => !done.has(id) && id !== game.active);
  const tracked = game.active || nextFile();
  for (const id of game.active ? [game.active, ...open] : open) {
    const row = document.createElement("li");
    const address = town.byId.get(id);
    const pin = document.createElement("b");
    pin.className = "filePin";
    pin.textContent = address.symbol;
    pin.style.backgroundColor = address.color;
    const details = document.createElement("div");
    const status = document.createElement("small");
    const state = id === tracked ? (game.active ? "currentCase" : "nextCase") : (game.active ? "waitingCase" : "openCase");
    status.textContent = id === game.active ? t(state) : t(state) + " · " + placeName(id);
    const name = document.createElement("strong");
    name.textContent = t(id);
    const brief = document.createElement("p");
    brief.textContent = t(id + "Summary");
    details.append(status, name, brief);
    if (id === game.active) {
      const step = document.createElement("p");
      step.className = "fileStep";
      step.textContent = placeName(end === target ? "target" : end.id) + " · " + t(objective());
      details.append(step);
    }
    row.append(pin, details);
    list.append(row);
  }
  hud("#filesNote", !tracked ? t("filesClosed") : game.active ? (open.length ? t("filesWaiting") : "") : t("fileSources"));
  $("#casebook").scrollTop = 0;
}
export { atObjective, routeHUD, showMapSheet };
