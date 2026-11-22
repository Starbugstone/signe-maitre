import { cars, fx, game, held, p, people, trails } from "../core/state.js";
import { steeringInput, throttleInput, walkVector } from "../core/controls.js";
import { renderMessage, say } from "../ui/dialogs.js";
import { combo, landSlap, slap } from "./slap.js";
import { advanceTraffic, drive } from "./driving.js";
import { sedan, streamPopulation, person, target } from "../world/population.js";
import { blocked, distanceToBody, footBlocked, freeSpot, move, shutIn, vehicleBlocked } from "../world/collision.js";
import { carContact } from "../world/vehicle-shape.js";
import { footfall } from "../audio/mixer.js";
import { strides } from "../art/gait.js";
import { updateAmbulance } from "./rescue.js";
import { updatePerson } from "./crowd.js";

let inspectorClock = 0,
  radioClock = 35,
  radioLine = 0;
const walkPace = 24,
  runPace = 48;
function update(dt) {
  streamPopulation(p.x, p.y, game.vw, game.vh);
  game.time += dt;
  game.quipTime = Math.max(0, game.quipTime - dt);
  game.quipCooldown = Math.max(0, game.quipCooldown - dt);
  radioClock -= dt;
  if (radioClock <= 0 && !game.msgLife) {
    say(["fuel", "clocked", "printer", "horn"][radioLine++ % 4], 5, "clerk");
    radioClock = 47;
  }
  game.hitCooldown = Math.max(0, game.hitCooldown - dt);
  game.flash = Math.max(0, game.flash - dt);
  if (game.flash > 0 && game.flash <= 0.24 && !combo.slapLanded) {
    combo.slapLanded = true;
    landSlap();
  }
  game.heat = Math.max(0, game.heat - dt * 0.055);
  if (game.msgLife > 0 && (game.msgLife -= dt) <= 0) {
    game.msgLife = 0;
    renderMessage();
  }
  p.moving = false;
  if (game.ride) {
    const v = game.ride;
    drive(v, dt, throttleInput(), steeringInput(), held.has("action"));
    p.x = v.x;
    p.y = v.y;
    p.a = v.a;
    if (game.active === "repo" && v === target) game.stage = "deliver";
  } else {
    const [dx, dy] = walkVector();
    if (dx || dy) {
      if (game.flash <= 0) p.a = Math.atan2(dy, dx);
      const mag = Math.max(1, Math.hypot(dx, dy)),
        startX = p.x,
        startY = p.y,
        pace = held.has("run") ? runPace : walkPace;
      move(p, (dx / mag) * pace * dt, (dy / mag) * pace * dt, 2.6);
      const travel = Math.hypot(p.x - startX, p.y - startY);
      p.moving = travel > 0.005;
      p.walkDistance = (p.walkDistance || 0) + travel;
      stepSound(travel);
      if (p.moving) p.hasWalked = true;
      // A walker boxed in by vehicles that keeps pushing is lifted to the nearest clear spot.
      p.stuck = p.moving ? 0 : (p.stuck || 0) + dt;
      const overlapping = p.stuck > 0.45 && footBlocked(p.x, p.y, 2.6);
      if (overlapping || (p.stuck > 0.45 && shutIn(p, 2.6))) {
        // From a pocket, land on open ground outside it rather than elsewhere inside.
        const spot = freeSpot(p.x, p.y, 2.6, overlapping ? 0 : 16);
        if (spot) Object.assign(p, spot, { stuck: 0 });
      }
    } else p.stuck = 0;
    if (held.has("action")) slap();
  }
  for (const c of cars) if (c.route) advanceTraffic(c, dt);
  towBlockers();
  for (const n of people) updatePerson(n, dt);
  updateAmbulance(dt);
  inspectorClock -= dt;
  if (game.heat > 1.3 && inspectorClock <= 0 && people.filter((n) => n.kind === "inspector").length < 4) {
    for (let dx of [-70, 70, 0])
      if (!blocked(p.x + dx, p.y + 28, 4)) {
        person(p.x + dx, p.y + 28, "inspector");
        break;
      }
    inspectorClock = 8;
    say("standards", 5, "dispatch");
  }
  for (let list of [fx, trails])
    for (let i = list.length - 1; i >= 0; i--) {
      list[i].t -= dt;
      if (list[i].t <= 0) list.splice(i, 1);
    }
}

// A car left across the traffic for ten seconds, with the player away from it, is towed:
// the étude's sedan back to its spot, any other abandoned car off the street. Case cars,
// ambulances and the car the player is in are never touched.
function towBlockers() {
  for (const c of cars) {
    const v = c.route?.stalledBy;
    if (!v || v.route || v === game.ride || v === target || v.medical || c.route.stalledFor < 10) continue;
    if (Math.hypot(v.x - p.x, v.y - p.y) < 30 || !cars.includes(v)) continue;
    if (v === sedan) {
      // Already home, or someone is standing on its spot: leave it for now.
      if (Math.hypot(sedan.x - sedan.home.x, sedan.y - sedan.home.y) < 4) continue;
      const home = { ...sedan.home, halfLength: sedan.halfLength, halfWidth: sedan.halfWidth };
      if (vehicleBlocked(home) || cars.some((o) => o !== sedan && carContact(home, o))) continue;
      if ([p, ...people].some((n) => distanceToBody(home, n.x, n.y) < 3)) continue;
      fx.push({ x: v.x, y: v.y - 10, t: 1.2, s: "towing" });
      Object.assign(sedan, sedan.home, { speed: 0, slideX: 0, slideY: 0 });
      say("towed", 5, "clerk");
    } else {
      fx.push({ x: v.x, y: v.y - 10, t: 1.2, s: "towing" });
      cars.splice(cars.indexOf(v), 1);
    }
    c.route.heldBy = c.route.stalledBy = null;
    c.route.stalledFor = 0;
  }
}
// Footsteps land on the painted stride: every 6.8 units walking, every 13.6 running.
function stepSound(travel) {
  const before = Math.floor(p.stepPhase || 0);
  p.stepPhase = (p.stepPhase || 0) + travel / strides[held.has("run") ? "run" : "walk"];
  const beat = Math.floor(p.stepPhase);
  if (beat !== before) footfall(beat);
}

export { stepSound, update };
