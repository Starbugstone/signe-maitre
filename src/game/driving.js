import { cars, clamp, dist, fx, game, p, people, trails } from "../core/state.js";
import { beep } from "../audio/mixer.js";
import { distanceToBody, vehicleBlocked } from "../world/collision.js";
import { outsideView, viewport } from "../world/viewport.js";
import { recordImpact } from "./damage.js";
import { CELL_H, CELL_W, H, W, X, Y, roadsX, roadsY } from "../world/town.js";

import { carContact, sedanHalfLength, sedanHalfWidth } from "../world/vehicle-shape.js";

const quarterTurn = Math.PI / 2;
function closingSpeed(a, b, normal) {
  // Both velocity vectors are measured in world coordinates, including reverse and tyre slip.
  return Math.max(
    0,
    ((b.slideX || 0) - (a.slideX || 0)) * normal.nx + ((b.slideY || 0) - (a.slideY || 0)) * normal.ny,
  );
}
function clearTraffic(v, oldX, oldY, oldAngle) {
  for (const other of cars) {
    if (other === v) continue;
    const hit = carContact(v, other);
    if (!hit) continue;
    const x = v.x + hit.nx * (hit.depth + 0.03),
      y = v.y + hit.ny * (hit.depth + 0.03);
    if (!vehicleBlocked(v, x, y)) {
      v.x = x;
      v.y = y;
    } else {
      const previous = carContact({ ...v, x: oldX, y: oldY, a: oldAngle }, other);
      if (hit.depth >= (previous?.depth || 0)) {
        v.x = oldX;
        v.y = oldY;
        v.a = oldAngle;
      }
    }
    const force = closingSpeed(v, other, hit);
    recordImpact(v, force, other);
    if (v.condition === 0) break;
    // Stop penetration, but preserve a slower car's forward motion in a rear-end impact.
    const inward = Math.max(0, -v.slideX * hit.nx - v.slideY * hit.ny);
    const correction = Math.min(force, inward);
    v.slideX += correction * hit.nx;
    v.slideY += correction * hit.ny;
    v.speed = v.slideX * Math.cos(v.a) + v.slideY * Math.sin(v.a);
  }
}
function angleDifference(to, from) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
function drive(v, dt, throttle, steering, brake) {
  if (v.condition === 0) {
    v.speed = v.slideX = v.slideY = 0;
    return;
  }
  const oldAngle = v.a;
  const opposition = v.speed * throttle < 0 && Math.abs(v.speed) > 2;
  const acceleration = opposition ? 260 : throttle < 0 ? 85 : 122;
  v.speed = clamp(v.speed + throttle * acceleration * dt, -57, 120 + 61 * ((v.condition ?? 100) / 100));
  v.speed *= Math.exp(-dt * (brake ? 4.6 : throttle ? 0.16 : 1.45));
  if (!throttle && Math.abs(v.speed) < 0.55) v.speed = 0;
  const steerRate = brake ? 3.6 : 2.65 - 0.72 * Math.min(1, Math.abs(v.speed) / 150);
  const rolling = Math.min(1, Math.abs(v.speed) / 18);
  v.a += steering * Math.sign(v.speed) * rolling * steerRate * dt;
  if (!steering && !brake && rolling) {
    const cardinal = Math.round(v.a / quarterTurn) * quarterTurn;
    const error = angleDifference(cardinal, v.a);
    if (Math.abs(error) < Math.PI / 25.7)
      v.a = Math.abs(error) < 0.003 ? cardinal : v.a + error * (1 - Math.exp(-dt * 12 * rolling));
  }
  v.a = angleDifference(v.a, 0);
  if (v.a !== oldAngle && vehicleBlocked(v)) v.a = oldAngle;
  const vx = Math.cos(v.a) * v.speed,
    vy = Math.sin(v.a) * v.speed;
  // Normal tyres track the steering axis. The handbrake deliberately lets the rear slide.
  v.slipRecovery = brake ? 0.25 : Math.max(0, (v.slipRecovery || 0) - dt);
  const grip = v.slipRecovery > 0 ? 1 - Math.exp(-dt * (3.2 + 23 * (1 - v.slipRecovery / 0.25))) : 1;
  v.slideX += (vx - v.slideX) * grip;
  v.slideY += (vy - v.slideY) * grip;
  const oldX = v.x,
    oldY = v.y;
  const dx = v.slideX * dt,
    dy = v.slideY * dt;
  const hitX = dx !== 0 && vehicleBlocked(v, v.x + dx, v.y);
  if (!hitX) v.x += dx;
  const hitY = dy !== 0 && vehicleBlocked(v, v.x, v.y + dy);
  if (!hitY) v.y += dy;
  if (hitX || hitY) {
    const blockedSpeed = Math.hypot(hitX ? v.slideX : 0, hitY ? v.slideY : 0);
    const tangent = hitX ? Math.abs(v.slideY) : Math.abs(v.slideX);
    if ((hitX && hitY) || blockedSpeed > tangent * 1.25) {
      recordImpact(v, blockedSpeed, null);
      v.speed *= -0.18;
      v.slideX = 0;
      v.slideY = 0;
    } else {
      recordImpact(v, blockedSpeed, null);
      const tangentHeading = hitX ? Math.sign(Math.sin(v.a)) * quarterTurn : Math.cos(v.a) >= 0 ? 0 : Math.PI;
      const heading = v.a + angleDifference(tangentHeading, v.a) * (1 - Math.exp(-dt * 15));
      if (!vehicleBlocked(v, v.x, v.y, heading)) v.a = heading;
      v.speed *= Math.exp(-dt * 1.8);
      if (hitX) v.slideX = 0;
      if (hitY) v.slideY = 0;
    }
  }
  clearTraffic(v, oldX, oldY, oldAngle);
  if (brake && Math.abs(v.speed) > 36) trails.push({ x: v.x, y: v.y, a: v.a, t: 5 });
}
// Traffic follows its block loop on a path line, at a lane offset from it. Drivers
// ease their speed, keep a gap to traffic going their way and to anything stopped in
// the road, yield at junctions, sound the horn at people in the way and pull out
// around a car that has stopped for good. Cross traffic is left to the junction yield,
// so cars never wait on each other in a circle.
const trafficAccel = 30,
  trafficBrake = 130,
  passingLanes = [-12, -17],
  pavementLanes = [9, 12],
  turnRadius = 8;
let nextTrafficId = 1;
function pathAdvance(route, dt, step, lane = route.lane || 0) {
  const points = route.points,
    i = route.to,
    count = points.length;
  const destination = points[i],
    before = points[(i + count - 1) % count],
    after = points[(i + 1) % count];
  const ix = Math.sign(destination.x - before.x),
    iy = Math.sign(destination.y - before.y);
  const ox = Math.sign(after.x - destination.x),
    oy = Math.sign(after.y - destination.y);
  const entrance = { x: destination.x - turnRadius * ix, y: destination.y - turnRadius * iy };
  let { px: x, py: y } = route,
    arc = route.arc || 0,
    a,
    turnDone = false;
  const remaining = (entrance.x - x) * ix + (entrance.y - y) * iy;
  if (remaining > step && arc === 0) {
    x += ix * step;
    y += iy * step;
    a = Math.atan2(iy, ix);
  } else {
    // Out in a passing lane the turn is wider; keep the speed along it the same.
    arc = Math.min(quarterTurn, arc + (step - Math.max(0, remaining)) / Math.max(turnRadius, turnRadius - lane));
    const forward = turnRadius * Math.sin(arc),
      turn = turnRadius * (1 - Math.cos(arc));
    x = entrance.x + ix * forward + ox * turn;
    y = entrance.y + iy * forward + oy * turn;
    a = Math.atan2(iy * Math.cos(arc) + oy * Math.sin(arc), ix * Math.cos(arc) + ox * Math.sin(arc));
    turnDone = arc >= quarterTurn;
  }
  return { x, y, a, arc: turnDone ? 0 : arc, to: turnDone ? (i + 1) % count : i, remaining, destination };
}
// The pose `distance` further along the route, carrying on past corners onto the next street.
function pathAt(route, distance, lane = route.lane || 0) {
  const walker = { points: route.points, to: route.to, arc: route.arc || 0, px: route.px, py: route.py };
  let pose = pathAdvance(walker, 0, 0, lane);
  for (let left = distance; left > 0; left -= 4) {
    pose = pathAdvance(walker, 0, Math.min(4, left), lane);
    Object.assign(walker, { px: pose.x, py: pose.y, arc: pose.arc, to: pose.to });
  }
  return pose;
}
function placed(path, lane) {
  return { x: path.x - Math.sin(path.a) * lane, y: path.y + Math.cos(path.a) * lane, a: path.a };
}
const crossing = (o, a) => o.route && Math.abs(Math.cos(o.a - a)) < 0.5;
// Last resort against any circle of cars waiting on each other (A on B on ... on A):
// after three seconds the oldest car in the circle drives on as if the next were not there.
function yieldsTo(c, o) {
  if (!c.route || !o.route || c.route.wait < 3) return false;
  let x = o;
  for (let k = 0; k < 5 && x?.route; k++) {
    x = x.route.heldBy;
    if (x === c) return c.route.id < o.route.id;
  }
  return false;
}
// Oncoming route traffic keeps to its own lane, so it only matters while passing.
const oncoming = (o, a) => o.route && Math.abs(o.route.lane) <= 6 && Math.cos(o.a - a) <= -0.5;
// The nearest thing in the corridor swept between two lane offsets ahead of the car.
// Route traffic crossing the corridor is ignored: the junction rules handle it.
function lookAhead(c, path, laneFrom, laneTo, reach, passing = laneFrom !== 0 || laneTo !== 0) {
  const cos = Math.cos(path.a),
    sin = Math.sin(path.a),
    length = c.halfLength ?? sedanHalfLength,
    width = c.halfWidth ?? sedanHalfWidth;
  const low = Math.min(laneFrom, laneTo) - width,
    high = Math.max(laneFrom, laneTo) + width;
  let gap = Infinity,
    what = null;
  function consider(o, along, across, margin) {
    const dx = o.x - path.x,
      dy = o.y - path.y;
    const forward = dx * cos + dy * sin,
      side = -dx * sin + dy * cos;
    if (forward <= 0 || forward > reach + 30) return;
    if (side + across < low - margin || side - across > high + margin) return;
    const clear = forward - length - along;
    if (clear < gap) {
      gap = clear;
      what = o;
    }
  }
  for (const o of cars) {
    if (o === c || crossing(o, path.a) || (!passing && oncoming(o, path.a)) || yieldsTo(c, o)) continue;
    const rel = o.a - path.a,
      hl = o.halfLength ?? sedanHalfLength,
      hw = o.halfWidth ?? sedanHalfWidth;
    // A tight margin, so cars parked at the kerb do not count as in the lane.
    consider(
      o,
      hl * Math.abs(Math.cos(rel)) + hw * Math.abs(Math.sin(rel)),
      hl * Math.abs(Math.sin(rel)) + hw * Math.abs(Math.cos(rel)),
      0.2,
    );
  }
  for (const n of people) consider(n, 2.6, 2.6, 1);
  if (!game.ride) consider(p, 2.6, 2.6, 1);
  return { gap, what };
}
function clearPose(c, pose) {
  const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
  if (vehicleBlocked(body)) return false;
  if (!game.ride && distanceToBody(body, p.x, p.y) < 3) return false;
  return !cars.some((o) => o !== c && carContact(body, o));
}
function isStalled(o) {
  if (o === p || people.includes(o)) return false;
  return (Math.abs(o.speed || 0) < 1 || o.condition === 0) && !(o.route && o.route.wait < 1.5);
}
// Swing out just as far as the obstruction needs, and only on a long straight: the
// whole pass, out, alongside and back, must fit before the corner.
function startPass(c, route, probe, here) {
  // Never from inside a turn; near a corner the swept check below follows the turn itself.
  if (probe.arc !== 0 || probe.remaining < 20) return;
  // Held up for a while with the road itself blocked, a driver mounts the kerb on its own
  // side and squeezes past along the pavement, as city drivers do.
  const lanes = route.wait > 4 ? [...passingLanes, ...pavementLanes] : passingLanes;
  const lane = lanes.find(
    (l) =>
      [8, 22, 36, 50].every((d) => clearPose(c, placed(pathAt(route, d, l), l))) &&
      lookAhead(c, here, l, l, 60).gap > 50,
  );
  if (lane === undefined) return;
  route.laneTarget = lane;
  // The two-second limit on a held-up pass counts from here.
  route.wait = 0;
}
function offscreen(o) {
  return outsideView(o, viewport(game.camX, game.camY, game.vw || 300, game.vh || 220, W, H), 16);
}
// Reverse a few units along the straight, if the road behind is clear.
function backOff(c, route, probe, dt) {
  if (probe.arc !== 0) return;
  const back = 10 * dt,
    px = route.px - Math.cos(probe.a) * back,
    py = route.py - Math.sin(probe.a) * back;
  const pose = placed({ x: px, y: py, a: probe.a }, route.lane);
  if (!clearPose(c, pose)) return;
  route.px = px;
  route.py = py;
  Object.assign(c, { x: pose.x, y: pose.y, a: probe.a });
}
function honk(c, at) {
  c.route.honked = game.time;
  fx.push({ x: c.x, y: c.y - 10, t: 0.9, s: "honk" });
  if (dist(c, p) < 140) beep(392, 0.16, "sawtooth");
  if (at && at !== p && !at.down) at.startled = { from: c, until: game.time + 1.6 };
}
// The first walker the car's body would touch along its own path, turn included.
// The first vehicle the car's body would touch along its path round a corner. Crossing
// route traffic is left to the junction rules, as on the straight.
function vehicleOnPath(c, route, lane, from, reach) {
  for (let d = Math.max(4, from); d <= reach; d += 4) {
    const pose = placed(pathAt(route, d, lane), lane);
    const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
    for (const o of cars) {
      if (o === c || crossing(o, pose.a) || oncoming(o, pose.a) || yieldsTo(c, o)) continue;
      if (Math.abs(o.x - pose.x) > 26 || Math.abs(o.y - pose.y) > 26) continue;
      if (carContact(body, o) && !carContact({ ...c, halfLength: c.halfLength, halfWidth: c.halfWidth }, o))
        return { gap: d - 4, what: o };
    }
  }
  return { gap: Infinity, what: null };
}
function walkerOnPath(c, route, lane, reach) {
  const walkers = game.ride ? people : [...people, p];
  for (let d = 4; d <= reach; d += 4) {
    const pose = placed(pathAt(route, d, lane), lane);
    const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
    for (const n of walkers)
      if (Math.abs(n.x - pose.x) < 16 && Math.abs(n.y - pose.y) < 16 && distanceToBody(body, n.x, n.y) < 2.6)
        return { gap: d - 4, what: n };
  }
  return { gap: Infinity, what: null };
}
// How long the car has sat still behind the same stalled car (wreck, abandoned car):
// the towing rule reads it. Any other reason to wait, or a new blocker, starts again.
function stalledTimer(c, route, dt) {
  const v = route.heldBy && !route.heldBy.route && isStalled(route.heldBy) ? route.heldBy : null;
  route.stalledFor = v && v === route.stalledBy && c.speed < 0.5 ? (route.stalledFor || 0) + dt : 0;
  route.stalledBy = v;
}
function advanceTraffic(c, dt) {
  const route = c.route;
  if (route.px === undefined) {
    route.px = c.x;
    route.py = c.y;
  }
  route.id ??= nextTrafficId++;
  route.lane ??= 0;
  route.laneTarget ??= 0;
  route.speed ??= 0;
  route.wait ??= 0;
  const cruise = route.pace * 1.25;
  const probe = pathAdvance(route, 0, 0);
  // A driver stuck for a long time slips through the jam, but only where nobody can see.
  const ghost = route.wait > 6 && offscreen(c);
  // The road's heading, not the body's tilt during a lane change.
  const here = { x: route.px, y: route.py, a: probe.a };
  let desired = probe.arc > 0 || probe.remaining < 18 ? Math.min(cruise, 15 + Math.max(0, probe.remaining)) : cruise;
  if (route.lane !== 0) desired = Math.min(desired, cruise * 0.6);
  // Vehicles: the straight corridor ahead, cut off where the road turns away.
  const reach = 12 + route.speed * 0.9,
    straight = probe.arc === 0 ? Math.min(reach, Math.max(0, probe.remaining)) : 0;
  const watchFrom = route.laneTarget !== 0 ? route.laneTarget : route.lane;
  let { gap, what } = lookAhead(c, here, watchFrom, route.laneTarget, straight);
  // Round the corner and mid-turn, vehicles are checked along the body's real path.
  if (straight < reach) {
    const curved = vehicleOnPath(c, route, route.laneTarget || route.lane, straight, reach);
    if (curved.gap < gap) ({ gap, what } = curved);
  }
  // Walkers: wherever the body will actually go, round the corner too.
  if (what === p || people.includes(what)) ({ gap, what } = { gap: Infinity, what: null });
  const walker = walkerOnPath(c, route, route.laneTarget || route.lane, reach);
  if (walker.gap < gap) ({ gap, what } = walker);
  // Stop well short of a stalled car, leaving room to pull out round it.
  const margin = what && isStalled(what) ? 9 : 3;
  if (gap < reach && !(ghost && offscreen(what))) desired = Math.min(desired, Math.max(0, (gap - margin) * 2.4));
  // One vehicle in a junction at a time. A car is inside within 30 units of the centre,
  // or past the 40-unit stop line and heading in. A car stuck in there for over 4 s on
  // something other than traffic (a walker, a wreck), or the player's car left there for
  // 3 s, no longer holds it: others may go round, and contact checks keep them apart.
  const junctionX = roadsX[Math.round((probe.destination.x - X(0)) / CELL_W)];
  const junctionY = roadsY[Math.round((probe.destination.y - Y(0)) / CELL_H)];
  const within = (o, r) => Math.abs(o.x - junctionX) < r && Math.abs(o.y - junctionY) < r;
  const headingIn = (o) => (junctionX - o.x) * (o.slideX || 0) + (junctionY - o.y) * (o.slideY || 0) > 0;
  // Held up by moving traffic, following who waits on whom up to three cars along.
  const onTraffic = (o) => {
    for (let k = 0; k < 3 && o?.route; k++) {
      const next = o.route.heldBy;
      if (!next?.route) return false;
      if (Math.abs(next.speed || 0) > 1) return true;
      o = next;
    }
    return true;
  };
  const holds = (o) =>
    o !== c &&
    (o.route
      ? o.route.wait <= 4 || onTraffic(o)
      : o === game.ride
        ? route.wait <= 3
        : o.medical && Math.abs(o.speed || 0) > 1) &&
    (within(o, 30) || (within(o, 40) && headingIn(o)));
  const outside = !within(c, 40);
  // Do not drive into the junction when the way out is blocked by a stalled car.
  const exitBlocked = () => {
    for (let d = Math.max(0, probe.remaining); d < probe.remaining + 46; d += 6) {
      const pose = placed(pathAt(route, d), route.lane);
      const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
      const stuck = cars.find((o) => o !== c && !o.route && o !== game.ride && isStalled(o) && carContact(body, o));
      if (stuck) return stuck;
    }
    return null;
  };
  const exitCar = probe.arc === 0 && probe.remaining < 34 && route.laneTarget === 0 ? exitBlocked() : null;
  const occupied = outside && !ghost && (cars.some(holds) || !!exitCar);
  if (occupied) {
    // Brake to the stop line instead of stopping dead at it.
    const toLine = Math.max(Math.abs(c.x - junctionX), Math.abs(c.y - junctionY)) - 40 - 0.5;
    desired = Math.min(desired, Math.max(0, toLine * 2.5));
  }
  if (route.laneTarget !== route.lane) desired = Math.min(desired, Math.max(8, cruise * 0.6));
  const accel = desired > route.speed ? trafficAccel : trafficBrake;
  route.speed += clamp(desired - route.speed, -accel * dt, accel * dt);
  // Pull out around a parked or wrecked car before reaching its bumper.
  if (what && route.laneTarget === 0 && route.lane === 0 && gap < 40 && gap > 4 && isStalled(what))
    startPass(c, route, probe, here);
  // Held up by something in the lane, or last tick by the player or a parked car at the bumper.
  const heldBy = desired < 1 && what ? what : route.blocker && !route.blocker.route ? route.blocker : null;
  if (heldBy) {
    const person = heldBy === p || people.includes(heldBy);
    if ((person || heldBy === game.ride) && route.wait > 0.7 && game.time - (route.honked || -9) > 2.4) honk(c, heldBy);
    else if (isStalled(heldBy) && route.wait > 3 && game.time - (route.honked || -9) > 5) honk(c, null);
    if ((isStalled(heldBy) || (person && route.wait > 1.5)) && route.wait > 1.2 && route.laneTarget === 0 && route.lane === 0)
      startPass(c, route, probe, here);
  }
  // Merge back only once the passed car is behind and the way ahead in the home lane is open.
  if (route.laneTarget !== 0 && route.lane === route.laneTarget) {
    const home = [0, 10, 20].every((d) => clearPose(c, placed(pathAt(route, d), d ? route.lane * (1 - d / 25) : 0)));
    if (home && lookAhead(c, here, 0, 0, 60, false).gap > 30) route.laneTarget = 0;
  }
  // A pass held up for two seconds is called off, but only where the home lane beside is free.
  if (route.laneTarget !== 0 && route.wait > 2 && (route.lane === 0 || clearPose(c, placed(here, 0)))) route.laneTarget = 0;
  const step = route.speed * dt;
  const path = pathAdvance(route, dt, step);
  const body = (lane, shift) => {
    const pose = placed(path, lane);
    if (shift) pose.a = path.a + clamp(Math.atan2(shift, Math.max(step, 0.5)), -0.4, 0.4);
    return { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
  };
  // Lane changes ride on forward travel; a stopped car may still edge sideways onto a clear lane.
  const lateral = step > 0 ? step * 0.45 + 5 * dt : 4 * dt;
  const wantShift = clamp(route.laneTarget - route.lane, -lateral, lateral);
  // Is this pose free of the junction rule, kerbs, the player and other cars?
  function blockedAt(pose, moving) {
    if (!moving) return "still";
    if (!ghost && outside && within(pose, 40) && cars.some(holds)) return "junction";
    if ((pose.lane || route.lane) && vehicleBlocked(pose)) return "kerb";
    if (!game.ride && distanceToBody(pose, p.x, p.y) < 2.6 && distanceToBody(pose, p.x, p.y) < distanceToBody(c, p.x, p.y))
      return p;
    for (const other of cars) {
      if (other === c || (ghost && offscreen(other)) || yieldsTo(c, other)) continue;
      const hit = carContact(pose, other);
      if (!hit) continue;
      const before = carContact(c, other)?.depth ?? 0;
      // Mid-turn, a corner may graze a stalled car without stopping for good.
      // Two cars locked mid-turn: the older one squeezes past.
      // A turning body swings its tail; a stalled car behind the centre is not in the way.
      const behind = (other.x - c.x) * Math.cos(c.a) + (other.y - c.y) * Math.sin(c.a) < 0;
      if (route.arc > 0 && !other.route && isStalled(other) && behind) continue;
      const graze =
        route.arc > 0 &&
        route.wait > 2 &&
        ((!other.route && isStalled(other) && hit.depth < 0.6) ||
          (other.route?.arc > 0 && other.route.blocker === c && route.id < other.route.id && hit.depth < 1.5));
      if (hit.depth < before || graze) continue;
      return other;
    }
    return null;
  }
  let lane = route.lane + wantShift,
    next = body(lane, wantShift),
    blocker = blockedAt({ ...next, lane }, step > 0 || wantShift !== 0);
  // A sideways move that would touch something: keep rolling straight on instead.
  if (blocker && blocker !== "junction" && wantShift && step > 0) {
    const straightOn = body(route.lane, 0);
    if (!blockedAt({ ...straightOn, lane: route.lane }, true)) {
      lane = route.lane;
      next = straightOn;
      blocker = null;
    }
  }
  const obstructed = !!blocker;
  if (blocker && typeof blocker === "object" && (blocker === game.ride || blocker.medical) && route.speed > 0) {
    const hit = carContact(next, blocker);
    if (hit) recordImpact(blocker, closingSpeed(c, blocker, hit), c);
  }
  if (obstructed || desired < 1) route.wait += dt;
  else if (!ghost) route.wait = Math.max(0, route.wait - dt * 2);
  else if (gap > 15 && !cars.some((o) => o !== c && carContact(c, o))) route.wait = 0;
  const other = typeof blocker === "object" ? blocker : null;
  // Two cars nosed into each other: the one on the straight, in its own lane, backs off
  // for a second to open real room. Neither backs into a car that is out passing.
  if (other?.route && other.route.blocker === c && route.arc === 0 && !route.lane && !other.route.lane && route.wait > 1.5) {
    if (!(other.route.arc === 0 && other.route.id < route.id)) route.backing = game.time + 1;
  }
  // Out passing and met head-on: the passing car gives way and reverses.
  if (route.lane && what?.route && Math.cos(what.a - probe.a) < -0.5 && desired < 1 && route.wait > 1.5)
    route.backing = game.time + 1;
  // Nose against a stalled car with nowhere to pull out: reverse a little to make room.
  if (other && !other.route && isStalled(other) && route.arc === 0 && !route.lane && route.wait > 2 && route.laneTarget === 0)
    route.backing = game.time + 0.6;
  if (route.backing > game.time) {
    backOff(c, route, probe, dt);
    route.blocker = other;
    route.heldBy = other || what;
    stalledTimer(c, route, dt);
    route.speed = 0;
    return;
  }
  route.blocker = obstructed ? other : null;
  route.heldBy = other || (desired < 1 ? what || exitCar : null);
  stalledTimer(c, route, dt);
  if (obstructed) {
    route.speed = 0;
    c.speed = c.slideX = c.slideY = 0;
    return;
  }
  if (dt > 0) {
    c.slideX = (next.x - c.x) / dt;
    c.slideY = (next.y - c.y) / dt;
    c.speed = Math.hypot(c.slideX, c.slideY);
  }
  c.x = next.x;
  c.y = next.y;
  c.a = next.a;
  route.px = path.x;
  route.py = path.y;
  route.arc = path.arc;
  route.to = path.to;
  route.lane = lane;
}

export { carContact, closingSpeed, advanceTraffic, drive, lookAhead, quarterTurn };
