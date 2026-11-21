import { cars, dist, fx, game, held, p, people, trails } from "../core/state.js";
import { renderMessage, say } from "../ui/dialogs.js";
import { combo, landSlap, slap } from "./slap.js";
import { advanceTraffic, drive, quarterTurn } from "./driving.js";
import { streamPopulation, person, target } from "../world/population.js";
import { blocked, move } from "../world/collision.js";
import { crashSound, footfall } from "../audio/mixer.js";
import { office } from "../world/town.js";
import { knockDown, updateAmbulance } from "./rescue.js";

let inspectorClock = 0,
  radioClock = 35,
  radioLine = 0;
const stepLength = 6.8,
  walkPace = 24,
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
  const left = held.has("left"),
    right = held.has("right"),
    up = held.has("up"),
    down = held.has("down");
  p.moving = false;
  if (game.ride) {
    const v = game.ride;
    drive(v, dt, Number(up) - Number(down), Number(right) - Number(left), held.has("action"));
    p.x = v.x;
    p.y = v.y;
    p.a = v.a;
    if (game.active === "repo" && v === target) game.stage = "deliver";
  } else {
    let dx = Number(right) - Number(left),
      dy = Number(down) - Number(up);
    if (dx || dy) {
      if (game.flash <= 0) p.a = Math.atan2(dy, dx);
      let mag = Math.hypot(dx, dy);
      const startX = p.x,
        startY = p.y,
        pace = held.has("run") ? runPace : walkPace;
      move(p, (dx / mag) * pace * dt, (dy / mag) * pace * dt, 2.6);
      const travel = Math.hypot(p.x - startX, p.y - startY);
      p.moving = travel > 0.005;
      const previousBeat = Math.floor((p.walkDistance || 0) / stepLength);
      p.walkDistance = (p.walkDistance || 0) + travel;
      const beat = Math.floor(p.walkDistance / stepLength);
      if (beat !== previousBeat) footfall(beat);
      if (p.moving) p.hasWalked = true;
    }
    if (held.has("action")) slap();
  }
  for (const c of cars) if (c.route) advanceTraffic(c, dt);
  for (const n of people) {
    const beforeX = n.x,
      beforeY = n.y;
    n.moving = false;
    n.cool = Math.max(0, n.cool - dt);
    if (n.down > 0) {
      if (!n.knockedOut) {
        n.down = Math.max(0, n.down - dt);
        if (!n.down) n.hits = 0;
      }
      continue;
    }
    if (n.stagger > 0) {
      n.stagger -= dt;
      continue;
    }
    if (n.swing > 0) {
      const before = n.swing;
      n.swing = Math.max(0, n.swing - dt);
      if (before > 0.21 && n.swing <= 0.21 && !game.ride && dist(n, p) < 15) {
        crashSound(90, "slap");
        p.hp--;
        fx.push({ x: p.x, y: p.y - 13, t: 0.8, s: "ouch" });
        if (p.hp <= 0) {
          p.hp = 5;
          game.heat = 0;
          p.x = office.x;
          p.y = office.y;
          people.forEach((q) => {
            q.anger = 0;
            q.swing = 0;
          });
          say("concussion", 5, "clerk");
        }
      }
      continue;
    }
    n.anger = Math.max(0, n.anger - dt);
    const d = dist(n, p),
      chase = (n.anger > 0 || (n.kind === "inspector" && game.heat > 0.25)) && d < 190;
    if (game.ride && d < 10 && Math.abs(game.ride.speed) > 40) {
      crashSound(Math.abs(game.ride.speed), "thud");
      knockDown(n, "traffic");
      game.heat = Math.min(3, game.heat + 0.42);
      continue;
    }
    if (
      !game.ride &&
      d < 30 &&
      n.kind === "tough" &&
      !n.hits &&
      !n.insultCase &&
      (game.active === "flat" || game.active === "repo")
    ) {
      n.insultCase = game.active;
      say("outburst", 3.6, "bystander");
    }
    if (chase && d > 10) {
      n.a = Math.atan2(p.y - n.y, p.x - n.x);
      move(n, Math.cos(n.a) * dt * 51, Math.sin(n.a) * dt * 51, 3);
    } else if (chase && d <= 12 && !game.ride && !n.cool) {
      n.a = Math.atan2(p.y - n.y, p.x - n.x);
      n.cool = 1.35;
      n.swing = 0.37;
    } else if (!chase) {
      if (n.rest > 0) n.rest -= dt;
      else {
        const horizontal = n.axis === "x",
          home = horizontal ? n.homeX : n.homeY,
          pos = horizontal ? n.x : n.y;
        const end = home + n.sign * n.patrol,
          delta = n.sign * Math.min(n.pace * dt, Math.abs(end - pos));
        n.a = horizontal ? (n.sign > 0 ? 0 : Math.PI) : n.sign * quarterTurn;
        const hit = move(n, horizontal ? delta : 0, horizontal ? 0 : delta, 3);
        if (hit || (horizontal ? n.x : n.y) === end || (end - (horizontal ? n.x : n.y)) * n.sign < 0) {
          n.sign *= -1;
          n.rest = 0.38 + (1 + Math.sin(n.phase + game.time)) * 0.35;
        }
      }
    }
    const travel = Math.hypot(n.x - beforeX, n.y - beforeY);
    n.moving = travel > 0.35 * dt;
    n.gait = (n.gait || 0) + travel / (chase ? 3.1 : 2.25);
  }
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

export { stepLength, update };
