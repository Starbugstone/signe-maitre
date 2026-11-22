import { clamp, fx, game } from "../core/state.js";
import { crashSound } from "../audio/mixer.js";
import { box, say } from "../ui/dialogs.js";
import { nearestCar } from "./boarding.js";
import { fleetOf } from "./fleet.js";

function recordImpact(v, force, other) {
  if (force < 8) return;
  // Debounce the same surface. A second vehicle struck immediately afterwards still counts.
  if (other) {
    v.impactTimes ??= new WeakMap();
    other.impactTimes ??= new WeakMap();
    if (game.time < (v.impactTimes.get(other) ?? -1)) return;
    v.impactTimes.set(other, game.time + 0.22);
    other.impactTimes.set(v, game.time + 0.22);
  } else {
    if (game.time < (v.nextWallImpact ?? -1)) return;
    v.nextWallImpact = game.time + 0.22;
  }
  crashSound(force, other ? "body" : "wall");
  if (force < 17) return;
  // A full-speed crash costs about half the car; a scrape costs a few points.
  const loss = Math.max(1, Math.round(100 * Math.pow((force - 12) / 200, 1.7)));
  // Between two vehicles the lighter one takes the larger share; equal masses share alike.
  // Against a wall a heavy chassis shrugs off what folds a motorbike.
  const mass = fleetOf(v).mass,
    against = other ? fleetOf(other).mass : 0;
  const share = (c) => (other ? (2 * (c === v ? against : mass)) / (mass + against) : 1 / Math.sqrt(mass));
  const taken = Math.max(1, Math.round(loss * share(v)));
  for (const c of other ? [v, other] : [v]) {
    c.condition = clamp((c.condition ?? 100) - Math.max(1, Math.round(loss * share(c))), 0, 100);
    if (!c.condition) {
      c.speed = c.slideX = c.slideY = 0;
      if (c.route) {
        c.pausedRoute = c.route;
        c.route = null;
      }
    }
  }
  fx.push({ x: v.x, y: v.y - 12, t: 0.65, s: "clang" });
  if (v.condition === 0) say("breakdown", 5, "clerk");
  else if (taken >= 24) say("dented", 3, "clerk");
}
function recoveryCar() {
  const c = game.ride || nearestCar();
  return c && c.condition === 0 ? c : null;
}
function repairCar(c) {
  box("recovery", "recoveryText", [
    [
      "repair",
      () => {
        c.condition = 100;
        c.speed = c.slideX = c.slideY = 0;
        c.slipRecovery = 0;
        c.nextWallImpact = 0;
        if (c.pausedRoute) {
          c.route = c.pausedRoute;
          delete c.pausedRoute;
        }
        say("repaired", 4, "clerk");
      },
    ],
    ["outside"],
  ]);
}

export { recordImpact, recoveryCar, repairCar };
