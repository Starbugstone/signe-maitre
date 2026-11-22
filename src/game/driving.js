import { cars, clamp, dist, fx, game, p, people, trails } from "../core/state.js";
import { beep } from "../audio/mixer.js";
import { bodyExtra, distanceToBody, vehicleBlocked } from "../world/collision.js";
import { outsideView, viewport } from "../world/viewport.js";
import { recordImpact } from "./damage.js";
import { H, W } from "../world/town.js";
import { compileLegacyPoints, evalSegment } from "../world/routes.js";
import { carContact, sedanHalfLength, sedanHalfWidth } from "../world/vehicle-shape.js";
import { fleetOf } from "./fleet.js";
import { busStop } from "./fleet-traffic.js";

const quarterTurn = Math.PI / 2;
const TAU = 2 * Math.PI;

function closingSpeed(a, b, normal) {
  // Both velocity vectors are measured in world coordinates, including reverse and tyre slip.
  return Math.max(
    0,
    ((b.slideX || 0) - (a.slideX || 0)) * normal.nx + ((b.slideY || 0) - (a.slideY || 0)) * normal.ny,
  );
}
// How much of its closing speed a heavy vehicle keeps against a lighter one, and the push
// that goes with it. Equal masses give nothing, so two cars still stop each other dead.
function shove(v, other, hit, travel) {
  const mass = fleetOf(v).mass,
    against = fleetOf(other).mass;
  if (mass <= against * 1.5 || other.route || other.medical || other === game.ride) return 0;
  const share = Math.min(0.85, (mass - against) / (mass + against));
  const x = other.x - hit.nx * travel * share,
    y = other.y - hit.ny * travel * share;
  if (vehicleBlocked(other, x, y) || cars.some((o) => o !== v && o !== other && carContact({ ...other, x, y }, o)))
    return 0;
  if ([p, ...people].some((n) => (n !== p || !game.ride) && distanceToBody({ ...other, x, y }, n.x, n.y) < 2.6)) return 0;
  other.x = x;
  other.y = y;
  delete other.homeCell;
  return share;
}
function clearTraffic(v, oldX, oldY, oldAngle, dt) {
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
    // A heavier body keeps part of its way and shoves a parked car or a wreck ahead of it.
    const share = shove(v, other, hit, inward * dt);
    const correction = Math.min(force, inward) * (1 - share);
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
  const { x: oldX, y: oldY, a: oldAngle } = v;
  const spec = fleetOf(v);
  const opposition = v.speed * throttle < 0 && Math.abs(v.speed) > 2;
  const acceleration = opposition ? spec.brake : throttle < 0 ? spec.reverseAccel : spec.accel;
  // A battered engine loses a third of its top speed.
  const top = spec.topSpeed * (120 + 61 * ((v.condition ?? 100) / 100)) / 181;
  v.speed = clamp(v.speed + throttle * acceleration * dt, -spec.reverseSpeed, top);
  v.speed *= Math.exp(-dt * (brake ? 4.6 : throttle ? 0.16 : 1.45));
  if (!throttle && Math.abs(v.speed) < 0.55) v.speed = 0;
  const steerRate = (brake ? 3.6 : 2.65 - 0.72 * Math.min(1, Math.abs(v.speed) / 150)) * (spec.steer / 2.65);
  // Steering fades in from a standstill: no body turns tighter than its turning circle.
  const rolling = Math.min(1, Math.abs(v.speed) / (spec.steer * spec.turn));
  v.a += steering * Math.sign(v.speed) * rolling * steerRate * dt;
  // A two-wheeler banks into the turn; the picture follows `lean`.
  if (spec.leans) {
    const bank = steering * Math.sign(v.speed) * Math.min(1, Math.abs(v.speed) / 90);
    v.lean = (v.lean || 0) + (bank - (v.lean || 0)) * (1 - Math.exp(-dt * 9));
  }
  if (!steering && !brake && rolling) {
    const cardinal = Math.round(v.a / quarterTurn) * quarterTurn;
    const error = angleDifference(cardinal, v.a);
    if (Math.abs(error) < Math.PI / 25.7)
      v.a = Math.abs(error) < 0.003 ? cardinal : v.a + error * (1 - Math.exp(-dt * 12 * rolling));
  }
  v.a = angleDifference(v.a, 0);
  if (v.a !== oldAngle) {
    // A long vehicle swings about its rear axle: the nose pulls out and the tail follows.
    const back = (spec.pivot || 0) * spec.halfLength,
      x = v.x + back * (Math.cos(v.a) - Math.cos(oldAngle)),
      y = v.y + back * (Math.sin(v.a) - Math.sin(oldAngle));
    if (vehicleBlocked(v, x, y)) v.a = oldAngle;
    else {
      v.x = x;
      v.y = y;
    }
  }
  const vx = Math.cos(v.a) * v.speed,
    vy = Math.sin(v.a) * v.speed;
  // Normal tyres track the steering axis. The handbrake deliberately lets the rear slide.
  v.slipRecovery = brake ? 0.25 : Math.max(0, (v.slipRecovery || 0) - dt);
  // A heavy body takes a moment to follow its front wheels.
  const hold = spec.grip >= 1 ? 1 : 1 - Math.exp(-dt * 16 * spec.grip);
  const grip = v.slipRecovery > 0 ? Math.min(hold, 1 - Math.exp(-dt * (3.2 + 23 * (1 - v.slipRecovery / 0.25)))) : hold;
  v.slideX += (vx - v.slideX) * grip;
  v.slideY += (vy - v.slideY) * grip;
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
  clearTraffic(v, oldX, oldY, oldAngle, dt);
  if (brake && Math.abs(v.speed) > 36) trails.push({ x: v.x, y: v.y, a: v.a, t: 5, w: spec.halfWidth });
}

// Traffic follows compiled C1-continuous closed routes (straights, 90° corners, anticlockwise roundabouts).
// Drivers ease their speed, keep a gap to traffic ahead, yield at junctions and roundabout entries
// (priority to circulating traffic), sound the horn, pull out around stalled cars (mounting the pavement
// when necessary), and back off from nose-to-nose deadlocks.
const trafficAccel = 30,
  trafficBrake = 130,
  passingLanes = [-12, -17],
  pavementLanes = [9, 12];
let nextTrafficId = 1;

function ensureCompiled(c, route) {
  if (route.segments) return;
  if (route.points) {
    route.segments = compileLegacyPoints(route.points, Math.max(8, fleetOf(c).turn));
    if (!route.segments) return;
    // Find nearest segment & offset matching c's initial position.
    let bestIdx = 0,
      bestS = 0,
      bestD = Infinity;
    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i];
      if (seg.type !== "line") continue;
      const dx = seg.x2 - seg.x1,
        dy = seg.y2 - seg.y1;
      const t = seg.length > 0 ? clamp(((c.x - seg.x1) * dx + (c.y - seg.y1) * dy) / (seg.length * seg.length), 0, 1) : 0;
      const d = Math.hypot(c.x - (seg.x1 + dx * t), c.y - (seg.y1 + dy * t));
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
        bestS = t * seg.length;
      }
    }
    route.segIndex = bestIdx;
    route.s = bestS;
  }
}

function advanceAlong(segments, segIndex, s, step, lane = 0) {
  const count = segments.length;
  let idx = segIndex;
  let curS = s;
  let left = step;
  let guard = 0;
  while (left > 0 && guard++ < count + 2) {
    const seg = segments[idx];
    // Out in a passing lane on a turn arc, keep ground speed consistent with the larger radius.
    const radiusScale =
      seg.type === "arc"
        ? Math.max(0.5, seg.r / Math.max(4, seg.r + (seg.deltaA >= 0 ? -lane : lane)))
        : 1;
    const effStep = left * radiusScale;
    const avail = seg.length - curS;
    if (effStep < avail) {
      curS += effStep;
      left = 0;
    } else {
      left -= avail / radiusScale;
      idx = (idx + 1) % count;
      curS = 0;
    }
  }
  const seg = segments[idx];
  const pose = evalSegment(seg, curS);
  return {
    x: pose.x,
    y: pose.y,
    a: pose.a,
    segIndex: idx,
    s: curS,
    seg,
    turning: seg.type === "arc",
    inRoundabout: !!seg.inRoundabout,
    remaining: Math.max(0, seg.length - curS),
  };
}

function pathAt(route, distance, lane = route.lane || 0) {
  return advanceAlong(route.segments, route.segIndex, route.s, distance, lane);
}

function placed(path, lane) {
  return { x: path.x - Math.sin(path.a) * lane, y: path.y + Math.cos(path.a) * lane, a: path.a };
}

const crossing = (o, a) => o.route && Math.abs(Math.cos(o.a - a)) < 0.5;

// Last resort against any circle of cars waiting on each other (A on B on ... on A):
// after three seconds the oldest car in the circle latches priority long enough to clear the conflict.
function inDeadlockCycle(c, o) {
  let x = o;
  for (let k = 0; k < 6 && x?.route; k++) {
    x = x.route.heldBy;
    if (x === c) return c.route.id < o.route.id;
  }
  return false;
}
function yieldsTo(c, o) {
  if (!c.route || !o.route) return false;
  if (c.route.yieldTarget === o && game.time < (c.route.yieldUntil || 0)) return true;
  if (c.route.wait < 3) return false;
  if (inDeadlockCycle(c, o)) {
    c.route.yieldTarget = o;
    c.route.yieldUntil = game.time + 2.5;
    return true;
  }
  return false;
}

// Oncoming route traffic keeps to its own lane, so it only matters while passing.
const oncoming = (o, a) => o.route && Math.abs(o.route.lane || 0) <= 6 && Math.cos(o.a - a) <= -0.5;

// The nearest thing in the corridor swept between two lane offsets ahead of the car.
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
    if (forward <= 0 || forward > reach + 30 + bodyExtra(c) + Math.max(0, along - sedanHalfLength)) return;
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
    consider(
      o,
      hl * Math.abs(Math.cos(rel)) + hw * Math.abs(Math.sin(rel)),
      hl * Math.abs(Math.sin(rel)) + hw * Math.abs(Math.cos(rel)),
      0.2,
    );
  }
  for (const n of people) consider(n, 2.6, 2.6, 1);
  if (!game.ride && !game.transit) consider(p, 2.6, 2.6, 1);
  return { gap, what };
}

function clearPose(c, pose) {
  const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
  if (vehicleBlocked(body)) return false;
  if (!game.ride && !game.transit && distanceToBody(body, p.x, p.y) < 3) return false;
  return !cars.some((o) => o !== c && carContact(body, o));
}

function isStalled(o) {
  if (o === p || people.includes(o)) return false;
  return (Math.abs(o.speed || 0) < 1 || o.condition === 0) && !(o.route && o.route.wait < 1.5);
}

// Swing out just as far as the obstruction needs, and only on a long straight (not inside alleys or roundabouts).
function startPass(c, route, probe, here) {
  if (probe.turning || probe.inRoundabout || probe.seg.isAlley || probe.remaining < 20) return;
  const lanes = route.wait > 4 ? [...passingLanes, ...pavementLanes] : passingLanes;
  const lane = lanes.find(
    (l) =>
      [8, 22, 36, 50].every((d) => clearPose(c, placed(pathAt(route, d, l), l))) &&
      lookAhead(c, here, l, l, 60).gap > 50,
  );
  if (lane === undefined) return;
  route.laneTarget = lane;
  route.wait = 0;
}

function offscreen(o) {
  return outsideView(o, viewport(game.camX, game.camY, game.vw || 300, game.vh || 220, W, H), 16);
}

// Reverse a few units along the straight, if the road behind is clear.
function backOff(c, route, probe, dt) {
  if (probe.turning || route.s < 2) return;
  const back = Math.min(route.s, 10 * dt);
  const nextS = route.s - back;
  const pt = evalSegment(probe.seg, nextS);
  const pose = placed(pt, route.lane);
  if (!clearPose(c, pose)) return;
  route.s = nextS;
  Object.assign(c, { x: pose.x, y: pose.y, a: pose.a });
}

function honk(c, at) {
  c.route.honked = game.time;
  fx.push({ x: c.x, y: c.y - 10, t: 0.9, s: "honk" });
  if (dist(c, p) < 140) beep(392, 0.16, "sawtooth");
  if (at && at !== p && !at.down) at.startled = { from: c, until: game.time + 1.6 };
}

const behindBody = (c, other) =>
  (other.x - c.x) * Math.cos(c.a) + (other.y - c.y) * Math.sin(c.a) < 0;

// If a long tail has been held mid-turn, allow a shallow brush while it swings clear.
const tailBrush = (c, other, hit) =>
  c.route.wait > 2 && bodyExtra(c) > 0 && hit.depth < 2.5 && behindBody(c, other);

function vehicleOnPath(c, route, lane, from, reach) {
  const turning = route.segments[route.segIndex].type === "arc";
  for (let d = Math.max(4, from); d <= reach; d += 4) {
    const p0 = pathAt(route, d, lane);
    const pose = placed(p0, lane);
    const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
    for (const o of cars) {
      if (o === c || yieldsTo(c, o)) continue;
      if (!p0.inRoundabout && (crossing(o, pose.a) || oncoming(o, pose.a))) continue;
      const near = 26 + bodyExtra(c) + bodyExtra(o);
      if (Math.abs(o.x - pose.x) > near || Math.abs(o.y - pose.y) > near) continue;
      const hit = carContact(body, o);
      if (hit && !(turning && tailBrush(c, o, hit)) && !carContact(c, o))
        return { gap: d - 4, what: o };
    }
  }
  return { gap: Infinity, what: null };
}
// Room a driver leaves a walker: a body's width, or a hand's breadth once they have
// waited four seconds for someone who will not move, and until they are clear again.
function walkerRoom(route) {
  if (route.wait > 4) route.squeezing = true;
  else if (route.wait === 0) route.squeezing = false;
  return route.squeezing ? 0.8 : 2.6;
}
function walkerOnPath(c, route, lane, reach) {
  const walkers = game.ride || game.transit ? people : [...people, p],
    room = walkerRoom(route);
  for (let d = 4; d <= reach; d += 4) {
    const pose = placed(pathAt(route, d, lane), lane);
    const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
    for (const n of walkers)
      if (Math.abs(n.x - pose.x) < 16 + bodyExtra(c) && Math.abs(n.y - pose.y) < 16 + bodyExtra(c) && distanceToBody(body, n.x, n.y) < room)
        return { gap: d - 4, what: n };
  }
  return { gap: Infinity, what: null };
}

function stalledTimer(c, route, dt) {
  const v = route.heldBy && !route.heldBy.route && isStalled(route.heldBy) ? route.heldBy : null;
  route.stalledFor = v && v === route.stalledBy && c.speed < 0.5 ? (route.stalledFor || 0) + dt : 0;
  route.stalledBy = v;
}

// Roundabout yield-on-entry: check if any vehicle is circulating inside the roundabout in the
// incoming upstream sector (approaching anticlockwise from the driver's left) or blocking the join point.
function roundaboutBusy(c, rbEntry) {
  const { x: rx, y: ry, outerRadius, joinAngle, joinPt } = rbEntry;
  for (const o of cars) {
    if (o === c || yieldsTo(c, o)) continue;
    const dCenter = Math.hypot(o.x - rx, o.y - ry);
    if (dCenter > outerRadius + 6) continue;
    if (o === game.ride && c.route.wait > 3) continue;
    // Immediately blocking the join zone.
    if (Math.hypot(o.x - joinPt.x, o.y - joinPt.y) < 26) return o;
    // Circulating upstream (anticlockwise means decreasing polar angle, so upstream is higher angle +0..+1.75 rad).
    const oAngle = Math.atan2(o.y - ry, o.x - rx);
    const upstream = ((oAngle - joinAngle) % TAU + TAU) % TAU;
    if (upstream < 1.75) return o;
  }
  return null;
}

function advanceTraffic(c, dt) {
  const route = c.route;
  ensureCompiled(c, route);
  if (!route.segments?.length) return;
  route.id ??= nextTrafficId++;
  route.segIndex ??= 0;
  route.s ??= 0;
  route.lane ??= 0;
  route.laneTarget ??= 0;
  route.speed ??= 0;
  route.wait ??= 0;
  const spec = fleetOf(c),
    long = bodyExtra(c);
  const cruise = route.pace * 1.25 * spec.traffic.pace;
  const probe = pathAt(route, 0);
  const ghost = route.wait > 6 && offscreen(c);
  const here = { x: probe.x, y: probe.y, a: probe.a };

  let desired =
    probe.turning || probe.remaining < 18
      ? Math.min(cruise, probe.inRoundabout ? cruise * 0.85 : 15 + Math.max(0, probe.remaining))
      : cruise;
  if (route.lane !== 0) desired = Math.min(desired, cruise * 0.6);

  const reach = 12 + route.speed * 0.9;
  const straight = !probe.turning ? Math.min(reach, Math.max(0, probe.remaining)) : 0;
  const watchFrom = route.laneTarget !== 0 ? route.laneTarget : route.lane;
  let { gap, what } = lookAhead(c, here, watchFrom, route.laneTarget, straight);

  // Round the corner, in a roundabout, or nearing a turn: check along the real swept path.
  if (straight < reach) {
    const curved = vehicleOnPath(c, route, route.laneTarget || route.lane, straight, reach);
    if (curved.gap < gap) ({ gap, what } = curved);
  }
  if (what === p || people.includes(what)) ({ gap, what } = { gap: Infinity, what: null });
  const walker = walkerOnPath(c, route, route.laneTarget || route.lane, reach);
  if (walker.gap < gap) ({ gap, what } = walker);

  const margin = what && isStalled(what) ? 9 : 3;
  if (gap < reach && !(ghost && offscreen(what))) desired = Math.min(desired, Math.max(0, (gap - margin) * 2.4));

  // Junction / Roundabout entry yield rules.
  const junc = !probe.turning ? probe.seg.junction : null;
  const rbEntry = !probe.turning ? probe.seg.roundaboutEntry : null;

  const within = (o, r, extra = bodyExtra(o)) => junc && Math.abs(o.x - junc.x) < r + extra && Math.abs(o.y - junc.y) < r + extra;
  const headingIn = (o) => junc && (junc.x - o.x) * (o.slideX || 0) + (junc.y - o.y) * (o.slideY || 0) > 0;
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
    junc &&
    o !== c &&
    (o.route
      ? o.route.wait <= 4 || onTraffic(o)
      : o === game.ride
        ? route.wait <= 3
        : o.medical && Math.abs(o.speed || 0) > 1) &&
    (within(o, 30) || (within(o, 40) && headingIn(o)));

  const outside = junc ? !within(c, 40) : false;

  const exitBlocked = () => {
    for (let d = Math.max(0, probe.remaining); d < probe.remaining + 46 + 2 * long; d += 6) {
      const pose = placed(pathAt(route, d), route.lane);
      const body = { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
      const stuck = cars.find((o) => o !== c && !o.route && o !== game.ride && isStalled(o) && carContact(body, o));
      if (stuck) return stuck;
    }
    return null;
  };

  const stopRem = rbEntry ? (rbEntry.stopOffset ?? 8) + (c.halfLength ?? sedanHalfLength) + 2 : 0;
  const rbOutside = rbEntry ? probe.remaining >= stopRem - 2 : false;

  let exitCar = null;
  let yieldCar = null;
  let occupied = false;
  if (rbEntry) {
    // Yield outside the roundabout kerb (front bumper clear of outerRadius) to circulating traffic.
    if (rbOutside && probe.remaining < stopRem + 36) {
      yieldCar = roundaboutBusy(c, rbEntry);
      if (yieldCar && !ghost) {
        occupied = true;
        desired = Math.min(desired, Math.max(0, (probe.remaining - stopRem) * 2.5));
      }
    }
  } else if (junc) {
    exitCar = probe.remaining < 34 + long && route.laneTarget === 0 ? exitBlocked() : null;
    const holdingCar = outside && !ghost ? cars.find(holds) : null;
    yieldCar = holdingCar;
    occupied = outside && !ghost && (!!holdingCar || !!exitCar);
    if (occupied) {
      const toLine = Math.max(Math.abs(c.x - junc.x), Math.abs(c.y - junc.y)) - 40 - long - 0.5;
      desired = Math.min(desired, Math.max(0, toLine * 2.5));
    }
  }

  if (route.laneTarget !== route.lane) desired = Math.min(desired, Math.max(8, cruise * 0.6));
  if (spec.traffic.stops) desired = busStop(c, route, probe, desired, dt);
  const accel = desired > route.speed ? trafficAccel * Math.min(1, spec.accel / 122 + 0.35) : trafficBrake;
  route.speed += clamp(desired - route.speed, -accel * dt, accel * dt);

  // Pull out around a parked or wrecked car before reaching its bumper.
  if (what && route.laneTarget === 0 && route.lane === 0 && gap < 40 && gap > 4 && isStalled(what))
    startPass(c, route, probe, here);

  const heldBy = desired < 1 && what ? what : route.blocker && !route.blocker.route ? route.blocker : null;
  if (heldBy) {
    const person = heldBy === p || people.includes(heldBy);
    if ((person || heldBy === game.ride) && route.wait > 0.7 && game.time - (route.honked || -9) > 2.4)
      honk(c, heldBy);
    else if (isStalled(heldBy) && route.wait > 3 && game.time - (route.honked || -9) > 5) honk(c, null);
    if (
      (isStalled(heldBy) || (person && route.wait > 1.5)) &&
      route.wait > 1.2 &&
      route.laneTarget === 0 &&
      route.lane === 0
    )
      startPass(c, route, probe, here);
  }

  // Merge back once the passed car is behind and the home lane ahead is open.
  if (route.laneTarget !== 0 && route.lane === route.laneTarget) {
    const home = [0, 10, 20].every((d) => clearPose(c, placed(pathAt(route, d), d ? route.lane * (1 - d / 25) : 0)));
    if (home && lookAhead(c, here, 0, 0, 60, false).gap > 30) route.laneTarget = 0;
  }
  if (route.laneTarget !== 0 && route.wait > 2 && (route.lane === 0 || clearPose(c, placed(here, 0))))
    route.laneTarget = 0;

  const step = route.speed * dt;
  const path = advanceAlong(route.segments, route.segIndex, route.s, step, route.lane);
  const body = (lane, shift) => {
    const pose = placed(path, lane);
    if (shift) pose.a = path.a + clamp(Math.atan2(shift, Math.max(step, 0.5)), -0.4, 0.4);
    return { ...pose, halfLength: c.halfLength, halfWidth: c.halfWidth };
  };

  const lateral = step > 0 ? step * 0.45 + 5 * dt : 4 * dt;
  const wantShift = clamp(route.laneTarget - route.lane, -lateral, lateral);

  function blockedAt(pose, moving) {
    if (!moving) return "still";
    if (!ghost && junc && outside && within(pose, 40, long) && cars.some(holds)) return "junction";
    if (
      !ghost &&
      rbEntry &&
      rbOutside &&
      (path.segIndex !== route.segIndex || path.remaining < stopRem) &&
      roundaboutBusy(c, rbEntry)
    )
      return "junction";
    if ((pose.lane || route.lane || path.inRoundabout || path.seg.isAlley) && vehicleBlocked(pose)) return "kerb";
    if (
      !game.ride &&
      !game.transit &&
      distanceToBody(pose, p.x, p.y) < walkerRoom(route) &&
      distanceToBody(pose, p.x, p.y) < distanceToBody(c, p.x, p.y)
    )
      return p;
    for (const other of cars) {
      if (other === c || (ghost && offscreen(other)) || yieldsTo(c, other)) continue;
      const hit = carContact(pose, other);
      if (!hit) continue;
      const before = carContact(c, other)?.depth ?? 0;
      if (probe.turning && !other.route && isStalled(other) && behindBody(c, other)) continue;
      if (probe.turning && tailBrush(c, other, hit)) continue;
      const graze =
        probe.turning &&
        route.wait > 2 &&
        ((!other.route && isStalled(other) && hit.depth < 0.6) ||
          (other.route && other.route.blocker === c && route.id < other.route.id && hit.depth < 1.5));
      if (hit.depth < before || graze) continue;
      return other;
    }
    return null;
  }

  let lane = route.lane + wantShift,
    next = body(lane, wantShift),
    blocker = blockedAt({ ...next, lane }, step > 0 || wantShift !== 0);
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
  // An offscreen driver needs to keep moving until it is past the yield line and its
  // obstruction. Before then, a clear look-ahead can just mean the blocker is around the bend.
  else if (!yieldCar && !exitCar && gap > 15 && !cars.some((o) => o !== c && carContact(c, o))) route.wait = 0;

  const other = typeof blocker === "object" ? blocker : null;
  if (
    other?.route &&
    other.route.blocker === c &&
    !probe.turning &&
    !route.lane &&
    !other.route.lane &&
    route.wait > 1.5
  ) {
    if (!(other.route.id < route.id)) route.backing = game.time + 1;
  }
  if (route.lane && what?.route && Math.cos(what.a - probe.a) < -0.5 && desired < 1 && route.wait > 1.5)
    route.backing = game.time + 1;
  if (other && !other.route && isStalled(other) && !probe.turning && !route.lane && route.wait > 2 && route.laneTarget === 0)
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
  route.heldBy = other || (blocker === "junction" ? yieldCar : null) || (desired < 1 ? what || exitCar || yieldCar : null);
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
  if (spec.leans) {
    const bank = path.turning ? Math.sign(path.seg.deltaA) * 0.85 : 0;
    c.lean = (c.lean || 0) + (bank - (c.lean || 0)) * (1 - Math.exp(-dt * 7));
  }
  route.segIndex = path.segIndex;
  route.s = path.s;
  route.lane = lane;
}

export { carContact, closingSpeed, advanceTraffic, drive, lookAhead, quarterTurn };
