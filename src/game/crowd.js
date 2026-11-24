import { cue, say } from "../core/events.js";
import { callOut } from "./taunts.js";
import { cars, dist, fx, game, held, p, people } from "../core/state.js";
import { quarterTurn } from "./driving.js";
import { isFighter } from "../world/population.js";
import { footBlocked, freeSpot, move, strikeClear } from "../world/collision.js";
import { office } from "../world/town.js";
import { knockDown } from "./rescue.js";

// Street behaviour for residents, toughs and inspectors. Everyone keeps their old
// patrol, but now reads the street: they jump clear of cars on a collision course,
// scatter from horns and fights, step around obstacles and come back to their beat.
// Fighters close to striking range, keep apart, and take turns to swing.
const strikeRange = 12,
  closeRange = 10.5,
  maxSwingers = 2,
  hurtWindow = 0.6;

function swingers() {
  let count = 0;
  for (const n of people) if (n.swing > 0) count++;
  return count;
}
// Time until a moving car passes closest, and how close it comes.
function carThreat(n) {
  let worst = null;
  for (const c of cars) {
    const vx = c.slideX || 0,
      vy = c.slideY || 0,
      speed2 = vx * vx + vy * vy;
    if (speed2 < 18 * 18) continue;
    const rx = n.x - c.x,
      ry = n.y - c.y;
    if (Math.abs(rx) > 80 || Math.abs(ry) > 80) continue;
    const t = (rx * vx + ry * vy) / speed2;
    if (t < 0 || t > 0.95) continue;
    const miss = Math.hypot(rx - vx * t, ry - vy * t);
    if (miss < 9.5 && (!worst || t < worst.t)) worst = { c, t, vx, vy, rx, ry };
  }
  return worst;
}
// Move with a detour: when the way is blocked, try slipping past on either side.
function walk(n, angle, pace, dt) {
  const step = pace * dt;
  const before = { x: n.x, y: n.y },
    side = Math.sign(n.detour || 1);
  // Try straight on, then the side that worked last time, then the other, each from the same spot.
  for (const turn of [0, 0.7 * side, -0.7 * side, 1.4 * side, -1.4 * side]) {
    const a = angle + turn;
    n.x = before.x;
    n.y = before.y;
    move(n, Math.cos(a) * step, Math.sin(a) * step, 3);
    if (Math.hypot(n.x - before.x, n.y - before.y) > step * 0.35) {
      if (turn) n.detour = turn;
      n.a = a;
      return true;
    }
  }
  n.x = before.x;
  n.y = before.y;
  n.detour = -side;
  return false;
}
function shout(n, key) {
  if (game.time - (n.shouted || -9) < 3) return;
  n.shouted = game.time;
  fx.push({ x: n.x, y: n.y - 14, t: 0.8, s: key });
}
function hurtPlayer(n) {
  if (game.time < (p.hurtUntil || 0)) return;
  p.hurtUntil = game.time + hurtWindow;
  cue("crash", 90, "slap");
  p.hp--;
  fx.push({ x: p.x, y: p.y - 13, t: 0.8, s: "ouch" });
  if (p.hp > 0) return;
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
// The direction a fighter takes: straight in, or around the player while waiting a turn.
function approach(n, d, dt) {
  const toward = Math.atan2(p.y - n.y, p.x - n.x);
  let ax = Math.cos(toward),
    ay = Math.sin(toward);
  const waiting = d < 26 && swingers() >= maxSwingers && !(n.swing > 0);
  if (waiting) {
    // Circle at a short distance instead of crowding in.
    const side = Math.sin(n.phase * 7) > 0 ? 1 : -1;
    const radial = d < 18 ? -0.6 : 0.2;
    ax = Math.cos(toward) * radial - Math.sin(toward) * side;
    ay = Math.sin(toward) * radial + Math.cos(toward) * side;
  }
  // Keep a body's width from other fighters.
  for (const o of people) {
    if (o === n || o.down || !isFighter(o.kind)) continue;
    const ox = n.x - o.x,
      oy = n.y - o.y,
      gap = Math.hypot(ox, oy);
    if (gap > 0 && gap < 9) {
      ax += (ox / gap) * (9 - gap) * 0.25;
      ay += (oy / gap) * (9 - gap) * 0.25;
    }
  }
  if (!waiting && d <= closeRange) return;
  walk(n, Math.atan2(ay, ax), waiting ? 30 : 51, dt);
  n.a = toward;
}
function patrol(n, dt) {
  if (n.rest > 0) {
    n.rest -= dt;
    // Residents glance at a player who walks close by.
    if (!game.ride && dist(n, p) < 28) n.a = Math.atan2(p.y - n.y, p.x - n.x);
    return;
  }
  const horizontal = n.axis === "x",
    pos = horizontal ? n.x : n.y,
    home = horizontal ? n.homeX : n.homeY,
    offLine = horizontal ? n.homeY - n.y : n.homeX - n.x;
  // Pushed off the beat by a dodge or a chase: head back to it first.
  const awayFromHome = horizontal ? Math.abs(n.x - n.homeX) : Math.abs(n.y - n.homeY);
  if (Math.abs(offLine) > 2.5 || awayFromHome > n.patrol + 6) {
    const tx = horizontal ? clampTo(n.x, n.homeX, n.patrol) : n.homeX,
      ty = horizontal ? n.homeY : clampTo(n.y, n.homeY, n.patrol);
    if (!walk(n, Math.atan2(ty - n.y, tx - n.x), n.pace, dt) && (n.lost = (n.lost || 0) + dt) > 4) {
      // Give up on the exact line when a parked car now sits on it.
      n.homeX = n.x;
      n.homeY = n.y;
      n.lost = 0;
    }
    return;
  }
  n.lost = 0;
  const end = home + n.sign * n.patrol,
    delta = n.sign * Math.min(n.pace * dt, Math.abs(end - pos));
  n.a = horizontal ? (n.sign > 0 ? 0 : Math.PI) : n.sign * quarterTurn;
  const hit = move(n, horizontal ? delta : 0, horizontal ? 0 : delta, 3);
  const now = horizontal ? n.x : n.y;
  if (hit || now === end || (end - now) * n.sign < 0) {
    n.sign *= -1;
    // Longer pauses now and then: someone stops to check a phone or a shop window.
    n.rest = 0.38 + (1 + Math.sin(n.phase + game.time)) * 0.35 + (Math.sin(n.phase * 3 + game.time * 0.7) > 0.8 ? 2.2 : 0);
  }
}
function clampTo(value, home, range) {
  return Math.min(home + range, Math.max(home - range, value));
}

export function updatePerson(n, dt) {
  const beforeX = n.x,
    beforeY = n.y;
  n.moving = false;
  n.cool = Math.max(0, n.cool - dt);
  if (n.down > 0) {
    if (!n.knockedOut) {
      n.down = Math.max(0, n.down - dt);
      if (!n.down) n.hits = 0;
    }
    return;
  }
  if (n.stagger > 0) {
    n.stagger -= dt;
    return;
  }
  if (n.swing > 0) {
    const before = n.swing;
    n.swing = Math.max(0, n.swing - dt);
    if (before > 0.21 && n.swing <= 0.21 && !game.ride && !game.transit && dist(n, p) < 15 && strikeClear(n.x, n.y, p.x, p.y)) hurtPlayer(n);
    return;
  }
  n.anger = Math.max(0, n.anger - dt);
  const d = dist(n, p),
    // Nobody follows the player up to a ring platform or onto a train.
    chase = !game.transit && (n.anger > 0 || (n.kind === "inspector" && game.heat > 0.25)) && d < 190;
  if (game.ride && game.ride.domain !== "water" && d < 10 && Math.abs(game.ride.speed) > 40) {
    cue("crash", Math.abs(game.ride.speed), "thud");
    knockDown(n, "traffic");
    game.heat = Math.min(3, game.heat + 0.42);
    return;
  }
  if (!game.ride && d < 30 && n.kind === "tough" && !n.hits && !n.insultCase && (game.active === "flat" || game.active === "repo")) {
    n.insultCase = game.active;
    say("outburst", 3.6, "bystander");
  }
  // Jump clear of a car on a collision course, after a moment to notice it.
  const threat = carThreat(n);
  if (threat) {
    n.noticed = (n.noticed || 0) + dt;
    if (n.noticed > 0.12 + (1 + Math.sin(n.phase)) * 0.08) {
      const side = Math.sign(threat.ry * threat.vx - threat.rx * threat.vy) || 1,
        speed = Math.hypot(threat.vx, threat.vy);
      n.dodge = { x: (-threat.vy / speed) * side, y: (threat.vx / speed) * side, until: game.time + 0.45 };
      if (!isFighter(n.kind) || !chase) shout(n, "eek");
    }
  } else n.noticed = 0;
  if (n.dodge && game.time < n.dodge.until) {
    walk(n, Math.atan2(n.dodge.y, n.dodge.x), 62, dt);
  } else {
    n.dodge = null;
    // Horns, and the player's horn in particular, clear the road ahead.
    const horn = game.ride && held.has("horn") && dist(n, game.ride) < 55 ? { from: game.ride, until: game.time + 1.2 } : null;
    if (horn) n.startled = horn;
    // Residents scatter from a scuffle nearby.
    const scuffle = game.scuffle;
    if (!isFighter(n.kind) && n.kind !== "medic" && scuffle && game.time < scuffle.until && dist(n, scuffle) < 48 && n !== scuffle.victim)
      Object.assign(n, { fleeing: game.time + 2.2, fleeFrom: { x: scuffle.x, y: scuffle.y } });
    if (n.startled && game.time < n.startled.until && !chase) {
      // Step sideways off the car's line, to whichever side the walker is already on.
      const from = n.startled.from,
        side = Math.sign(-(n.x - from.x) * Math.sin(from.a) + (n.y - from.y) * Math.cos(from.a)) || 1;
      walk(n, from.a + (side * Math.PI) / 2 + side * 0.25, 40, dt);
      shout(n, "eek");
    } else if (n.fleeing > game.time && !chase) {
      walk(n, Math.atan2(n.y - n.fleeFrom.y, n.x - n.fleeFrom.x), 46, dt);
    } else {
      n.startled = null;
      if (chase && !game.ride && d < 42) callOut(n);
      if (chase && d <= strikeRange && !game.ride && !n.cool && swingers() < maxSwingers && strikeClear(n.x, n.y, p.x, p.y)) {
        n.a = Math.atan2(p.y - n.y, p.x - n.x);
        n.cool = 1.35 + (1 + Math.sin(n.phase * 5)) * 0.2;
        n.swing = 0.37;
      } else if (chase) approach(n, d, dt);
      else patrol(n, dt);
    }
  }
  // A body wedged between cars steps out instead of freezing.
  const travel = Math.hypot(n.x - beforeX, n.y - beforeY);
  n.stuck = travel > 0.01 ? 0 : (n.stuck || 0) + dt;
  if (n.stuck > 1 && footBlocked(n.x, n.y, 3)) {
    const spot = freeSpot(n.x, n.y, 3);
    if (spot) Object.assign(n, spot);
    n.stuck = 0;
  }
  n.moving = travel > 0.35 * dt;
}
