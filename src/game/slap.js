import { dist, fx, game, p, people } from "../core/state.js";
import { panel } from "../platform/canvas.js";
import { crashSound } from "../audio/mixer.js";
import { isFighter } from "../world/population.js";
import { move, strikeClear } from "../world/collision.js";
import { inService, crewInReach, interruptRescue, knockDown } from "./rescue.js";
import { say } from "../ui/dialogs.js";

const combo = {};
const slapDuration = 0.38;
combo.slapVictim = null;
combo.lastSlapped = null;
let comboUntil = 0;
combo.slapLanded = false;
function slap() {
  if (game.ride || game.hitCooldown > 0 || game.viewMap || panel.open) return;
  p.hasWalked = true;
  game.hitCooldown = 0.46;
  game.flash = slapDuration;
  combo.slapLanded = false;
  const reachable = people.filter((n) => !n.down && dist(n, p) < 18 && strikeClear(p.x, p.y, n.x, n.y));
  const crew = crewInReach();
  if (crew && strikeClear(p.x, p.y, crew.x, crew.y)) reachable.push(crew);
  combo.slapVictim =
    game.time < comboUntil && reachable.includes(combo.lastSlapped)
      ? combo.lastSlapped
      : reachable.sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (combo.slapVictim) p.a = Math.atan2(combo.slapVictim.y - p.y, combo.slapVictim.x - p.x);
  if (Math.abs(Math.cos(p.a)) > 0.15) game.lastDir = Math.cos(p.a) < 0 ? -1 : 1;
}
function landSlap() {
  let n = combo.slapVictim;
  combo.slapVictim = null;
  if (n?.crewOf) {
    const crew = crewInReach();
    if (!crew || crew.crewOf !== n.crewOf || !inService(n.crewOf) || !strikeClear(p.x, p.y, crew.x, crew.y)) return;
    n.crewOf.keysUntil = game.time + 7;
    n = interruptRescue(n.crewOf);
  }
  if (!n || n.down || dist(p, n) > 21 || !strikeClear(p.x, p.y, n.x, n.y)) return;
  combo.lastSlapped = n;
  // Bystanders scatter from a slap that lands, not from a swing at thin air.
  game.scuffle = { x: n.x, y: n.y, until: game.time + 0.3, victim: n };
  comboUntil = game.time + 0.85;
  crashSound(105, "slap");
  n.hits = (n.hits || 0) + 1;
  n.anger = isFighter(n.kind) ? 14 : 0;
  n.stagger = 0.33;
  n.swing = 0;
  n.cool = 0.55;
  move(n, Math.cos(p.a) * 2.7, Math.sin(p.a) * 2.7, 3);
  game.heat = Math.min(3, game.heat + 0.62);
  const echo = fx.find((f) => f.hit === n);
  if (echo) echo.t = 0;
  fx.push({ x: n.x, y: n.y - 12, t: 0.52, s: "impact", hit: n });
  game.quipTime = 1.1;
  if (n.hits >= 3) {
    knockDown(n, "slaps");
    say("served", 2);
  } else if (n.kind === "medic") say("medicHit", 2);
  else say(n.hits === 1 ? "service" : "initial", 1.6);
}

export { combo, landSlap, slap, slapDuration };
