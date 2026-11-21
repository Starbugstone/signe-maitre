import { cars, clamp, dist, game, p, trails } from "../core/state.js";
import { vehicleBlocked } from "../world/collision.js";
import { recordImpact } from "./damage.js";
import { CELL_H, CELL_W, X, Y, roadsX, roadsY } from "../world/town.js";

import { carContact } from "../world/vehicle-shape.js";

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
function advanceTraffic(c, dt) {
  const route = c.route,
    points = route.points,
    i = route.to,
    count = points.length;
  const destination = points[i],
    before = points[(i + count - 1) % count],
    after = points[(i + 1) % count];
  const ix = Math.sign(destination.x - before.x),
    iy = Math.sign(destination.y - before.y);
  const ox = Math.sign(after.x - destination.x),
    oy = Math.sign(after.y - destination.y);
  const radius = 8,
    entrance = { x: destination.x - radius * ix, y: destination.y - radius * iy };
  const step = route.pace * dt;
  let a = c.a,
    x = c.x,
    y = c.y,
    arc = route.arc || 0,
    turnDone = false;
  const remaining = (entrance.x - x) * ix + (entrance.y - y) * iy;
  if (remaining > step && arc === 0) {
    x += ix * step;
    y += iy * step;
    a = Math.atan2(iy, ix);
  } else {
    arc = Math.min(quarterTurn, arc + (step - Math.max(0, remaining)) / radius);
    const forward = radius * Math.sin(arc),
      turn = radius * (1 - Math.cos(arc));
    x = entrance.x + ix * forward + ox * turn;
    y = entrance.y + iy * forward + oy * turn;
    a = Math.atan2(iy * Math.cos(arc) + oy * Math.sin(arc), ix * Math.cos(arc) + ox * Math.sin(arc));
    turnDone = arc >= quarterTurn;
  }
  const next = { x, y, a };
  // A driver yields at the mouth of the junction until the vehicle inside has cleared it.
  const junctionX = roadsX[Math.round((destination.x - X(0)) / CELL_W)];
  const junctionY = roadsY[Math.round((destination.y - Y(0)) / CELL_H)];
  const inside = (o) => Math.abs(o.x - junctionX) < 32 && Math.abs(o.y - junctionY) < 32;
  const mustYield =
    (!inside(c) && inside(next) && cars.some((o) => o !== c && (o.route || o === game.ride) && inside(o))) ||
    (!game.ride && dist(next, p) < 10 && dist(next, p) < dist(c, p));
  if (!mustYield) {
    let obstructed = false;
    for (const other of cars) {
      if (other === c) continue;
      const hit = carContact(next, other);
      if (!hit || hit.depth < (carContact(c, other)?.depth ?? 0)) continue;
      // Ordinary traffic brakes for obstacles. A moving vehicle entering the player's car
      // can also be the one that makes contact on this simulation tick.
      if ((other === game.ride || other.medical) && c.speed > 0)
        recordImpact(other, closingSpeed(c, other, hit), c);
      obstructed = true;
      break;
    }
    if (!obstructed) {
      if (dt > 0) {
        c.slideX = (x - c.x) / dt;
        c.slideY = (y - c.y) / dt;
        c.speed = Math.hypot(c.slideX, c.slideY);
      }
      c.x = x;
      c.y = y;
      c.a = a;
      route.arc = turnDone ? 0 : arc;
      if (turnDone) route.to = (i + 1) % count;
      return;
    }
  }
  c.speed = c.slideX = c.slideY = 0;
}

export { carContact, closingSpeed, advanceTraffic, drive, quarterTurn };
