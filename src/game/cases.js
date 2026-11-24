import { ask, cue, say } from "../core/events.js";
import { interior, indoorAction, enterInterior, leaveInterior } from "./interior.js";
import { lang } from "../core/locale.js";
import { dist, done, game, p } from "../core/state.js";
import { auction, jobs, town } from "../world/town.js";
import { target } from "../world/population.js";
import { recoveryCar, repairCar } from "./damage.js";
import { exitCar } from "./boarding.js";
import { incidents } from "./rescue.js";

const files = ["repo", "noise", "flat"];
function nextFile() {
  return files.find((id) => !done.has(id));
}
const locations = {
  office: ["Bailiff’s office", "Étude"],
  repo: ["Crédit Sec", "Crédit Sec"],
  noise: ["Le Boum", "Le Boum"],
  flat: ["Résidence Mireille", "Résidence Mireille"],
  auction: ["Auction hall", "Hôtel des ventes"],
  target: ["Moutarde GT", "Moutarde GT"],
};
const placeName = (id) => locations[id][lang === "fr" ? 1 : 0];
function goal() {
  if (!game.active) {
    return town.byId.get(nextFile()) || null;
  }
  if (game.active === "repo") return game.ride === target ? auction : target;
  if (game.stage === "deliver") return auction;
  return jobs.find((j) => j.id === game.active);
}
function objective() {
  if (game.active === "repo") return game.ride === target ? "returnCar" : "findCar";
  if (game.active === "flat") return game.stage === "deliver" ? "returnLot" : "tagLot";
  return game.active === "noise" ? "record" : "free";
}
function accept(id) {
  game.active = id;
  game.stage = "visit";
  say(objective(), 4, "dispatch");
  cue("beep", 550);
}
function complete(fee, line) {
  done.add(game.active);
  game.active = "";
  game.stage = "";
  game.wallet += fee;
  cue("beep", 780, 0.22);
  game.quipTime = 2.4;
  say(line, 6, "clerk", "  +€" + fee);
}
function officeDesk() {
  const choices = files.filter((id) => !done.has(id) && !game.active).map((id) => [id, () => offer(id)]);
  if (incidents.length)
    choices.push([
      "lastIncident",
      () => {
        const note = incidents[incidents.length - 1];
        ask(note.title, note.copy, [["back"]]);
      },
    ]);
  if (game.active)
    choices.push([
      "drop",
      () => {
        game.active = "";
        game.stage = "";
        say("dropped");
      },
    ]);
  ask(
    "office",
    game.active ? "officeBusy" : done.size === 3 ? "officeDone" : done.size ? "officeRemaining" : "officeNew",
    [...choices, ...(!interior && !game.ride ? [["goInside", () => enterInterior("office")]] : []), ["back"]],
  );
}
function interact() {
  if (interior) {
    const action = indoorAction();
    if (action === "leaveRoom") leaveInterior();
    else if (action === "caseDesk") officeDesk();
    return;
  }
  if (game.dialogOpen || game.viewMap) return;
  const wreck = recoveryCar();
  if (wreck) {
    repairCar(wreck);
    return;
  }
  const near = jobs.find((j) => dist(j, p) < 36);
  if (game.active === "repo" && game.ride === target && near === auction) {
    if (exitCar()) complete(190, "soldCar");
    return;
  }
  if (game.active === "flat" && game.stage === "deliver" && near === auction) {
    complete(145, "soldLot");
    return;
  }
  if (game.active === "noise" && near?.id === "noise" && !game.ride) {
    ask("pv", "pvDraft", [["sign", () => complete(125, "signed")], ["pocket"]]);
    return;
  }
  if (game.active === "flat" && game.stage === "visit" && near?.id === "flat" && !game.ride) {
    ask("resident", "residentText", [
      [
        "tag",
        () => {
          game.stage = "deliver";
          say("tagged");
        },
      ],
      ["outside"],
    ]);
    return;
  }
  if (near?.id === "office") {
    officeDesk();
    return;
  }
  if (near && files.includes(near.id) && !game.active && !done.has(near.id)) {
    offer(near.id);
    return;
  }
  say(game.active ? objective() : "pins", 4, "clerk");
}
function offer(id) {
  ask(id, id + "Brief", [["take", () => accept(id)], ["leave"]]);
}

export { files, goal, interact, nextFile, objective, placeName };
