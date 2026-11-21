import { ambulance, inService, interruptRescue } from "./rescue.js";
import { cars, dist, game, p } from "../core/state.js";
import { blocked } from "../world/collision.js";
import { say } from "../ui/dialogs.js";
import { sedan, target } from "../world/population.js";
import { panel } from "../platform/canvas.js";
import { beep } from "../audio/mixer.js";

function exitCar() {
  if (!game.ride) return;
  for (const r of [19, 27, 37])
    for (let i = 0; i < 8; i++) {
      const a = game.ride.a + Math.PI / 2 + (i * Math.PI) / 4,
        x = game.ride.x + Math.cos(a) * r,
        y = game.ride.y + Math.sin(a) * r;
      if (!blocked(x, y, 2.6)) {
        game.ride.speed = 0;
        game.ride.slideX = 0;
        game.ride.slideY = 0;
        p.x = x;
        p.y = y;
        p.a = game.ride.a;
        game.ride = null;
        return;
      }
    }
  say("moveCar");
}
function nearestCar() {
  const unattended = cars.find((v) => v.medical && v.keysUntil > game.time && dist(p, v) < 22);
  if (unattended) return unattended;
  if (game.active === "repo" && dist(p, target) < 22) return target;
  if (ambulance && dist(p, ambulance) < 21) return ambulance;
  let nearest = null,
    d = 22;
  for (const c of cars) {
    const distance = dist(c, p);
    if (distance >= 22) continue;
    const score = distance + (c.route ? 4 : 0);
    if (nearest === null || score < d) {
      d = score;
      nearest = c;
    }
  }
  return nearest;
}
function board() {
  if (game.viewMap || panel.open) return;
  if (game.ride) {
    exitCar();
    return;
  }
  let c = nearestCar();
  if (!c) {
    say("closer");
    return;
  }
  if (c.condition === 0) {
    say("callRecovery");
    return;
  }
  const theft = inService(c);
  if (theft) {
    interruptRescue(c);
    game.heat = Math.min(3, game.heat + 0.85);
  }
  game.ride = c;
  delete c.homeCell;
  c.route = null;
  c.speed = c.slideX = c.slideY = 0;
  p.x = c.x;
  p.y = c.y;
  beep(180);
  if (game.active === "repo" && game.ride === target) {
    game.stage = "deliver";
    say("seized");
  } else if (c.medical) say("stolenMedic", 4, "dispatch");
  else say(c === sedan ? "sedan" : "keysIn", 4, c === sedan ? "" : c.model);
}

export { board, exitCar, nearestCar };
