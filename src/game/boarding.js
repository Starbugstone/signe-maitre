import { boatFleet, boardableBoat, dockBoat, dockingMooring, river, takeBoat } from "./boats.js";
import { ambulance, inService, interruptRescue } from "./rescue.js";
import { cars, dist, game, held, p } from "../core/state.js";
import { blocked, footBlocked } from "../world/collision.js";
import { say } from "../ui/dialogs.js";
import { sedan, target } from "../world/population.js";
import { panel } from "../platform/canvas.js";
import { beep } from "../audio/mixer.js";
import { enterStation, nearStation } from "./transit.js";

// An exit spot must leave room for the next step, not just for standing still.
function roomToWalk(x, y) {
  return [0, 1, 2, 3].filter((i) => !footBlocked(x + Math.cos((i * Math.PI) / 2) * 4, y + Math.sin((i * Math.PI) / 2) * 4, 2.6)).length >= 2;
}
// The door side must not open through a wall, a pier or the canal bank.
function clearLine(car, x, y) {
  const steps = Math.ceil(Math.hypot(x - car.x, y - car.y) / 2);
  for (let i = 1; i < steps; i++) if (blocked(car.x + ((x - car.x) * i) / steps, car.y + ((y - car.y) * i) / steps, 1.5)) return false;
  return true;
}
// Returns true once the player is standing beside the car.
function exitCar() {
  if (!game.ride) return false;
  // Prefer a door with room to walk away; a tight spot beats being trapped inside.
  for (const roomy of [true, false])
  for (const r of [19, 27, 37])
    for (let i = 0; i < 8; i++) {
      const a = game.ride.a + Math.PI / 2 + (i * Math.PI) / 4,
        x = game.ride.x + Math.cos(a) * r,
        y = game.ride.y + Math.sin(a) * r;
      if (!footBlocked(x, y, 2.6) && clearLine(game.ride, x, y) && (!roomy || roomToWalk(x, y))) {
        game.ride.speed = 0;
        game.ride.slideX = 0;
        game.ride.slideY = 0;
        p.x = x;
        p.y = y;
        p.a = game.ride.a;
        if (game.ride.medical) game.ride.sirenOn = false;
        held.delete("horn");
        game.ride = null;
        return true;
      }
    }
  say("moveCar");
  return false;
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
function nearestBoat() {
  return boardableBoat(boatFleet.boats, river.moorings, p);
}

function berthInReach() {
  return dockingMooring(boatFleet.boats, river.moorings, game.ride,
    ({ x, y }) => !footBlocked(x, y, 2.6));
}

function leaveBoat() {
  const berth = berthInReach();
  if (!berth) {
    say("boatDockFirst");
    return;
  }
  Object.assign(p, dockBoat(game.ride, berth));
  game.ride = null;
  held.delete("horn");
  say("boatMoored");
}

function board() {
  if (game.viewMap || panel.open) return;
  if (game.ride) {
    if (game.ride.domain === "water") leaveBoat();
    else exitCar();
    return;
  }
  const boat = nearestBoat();
  if (boat) {
    const theft = takeBoat(boat);
    if (theft) game.heat = Math.min(3, game.heat + 0.45);
    game.ride = boat;
    p.x = boat.x;
    p.y = boat.y;
    p.a = boat.a;
    beep(170);
    say(theft ? "boatTaken" : "boatBoarded", 4, boat.model);
    return;
  }
  const c = nearestCar();
  // At a ring station's stair foot, the car key climbs to the platform unless a car is closer.
  const station = nearStation();
  if (station && (!c || dist(p, station.street) <= dist(p, c))) {
    enterStation(station);
    return;
  }
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

export { berthInReach, board, exitCar, nearestBoat, nearestCar };
