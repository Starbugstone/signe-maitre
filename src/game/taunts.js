import { game } from "../core/state.js";
import { fighterLook } from "../world/population.js";

const genericLines = [
  "tauntConsole",
  "tauntPermit",
  "tauntMatches",
  "tauntCarioca",
  "tauntDoormat",
  "tauntCardigan",
  "tauntGrail",
];
const skinheadLines = ["un point de détail de l'histoire", "Janne, au secours"];
const linesByLook = {
  mariniere: ["Je passe partout", "rendez moi les clés"],
  bomber: skinheadLines,
  chelsea: skinheadLines,
};

export let taunt = null;

export function tauntLine({ speaker, index }) {
  const lines = (game.konamiHero && linesByLook[fighterLook(speaker)]) || genericLines;
  return lines[index % lines.length];
}

export function callOut(n) {
  if (game.time < (n.nextTaunt || 0) || (taunt && game.time < taunt.until + 1)) return;
  const index = n.lineIndex ?? Math.floor(n.phase);
  taunt = { speaker: n, index, until: game.time + 2.4 };
  n.lineIndex = index + 1;
  n.nextTaunt = game.time + 8;
}
