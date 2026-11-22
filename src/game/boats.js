import { clamp, dist } from "../core/state.js";
import { town } from "../world/town.js";
import { carContact } from "../world/vehicle-shape.js";

const metre = 4.8; // A 4.55 m saloon is 21.9 world units long.
export const boatTypes = {
  barge: { length: 38, beam: 5.05, mass: 90, thrust: 5, topSpeed: 29, rudder: 0.48, drag: 0.12, grip: 0.9 },
  riverboat: { length: 30, beam: 5.7, mass: 52, thrust: 8, topSpeed: 39, rudder: 0.66, drag: 0.16, grip: 1.1 },
  speedboat: { length: 7, beam: 2.15, mass: 1.8, thrust: 49, topSpeed: 123, rudder: 1.8, drag: 0.23, grip: 1.45 },
  launch: { length: 10, beam: 2.8, mass: 4, thrust: 31, topSpeed: 84, rudder: 1.48, drag: 0.32, grip: 1.85 },
};

export function makeBoat(model, pose) {
  const type = boatTypes[model];
  return {
    model, domain: "water", halfLength: type.length * metre / 2, halfWidth: type.beam * metre / 2,
    mass: type.mass, speed: 0, slideX: 0, slideY: 0, yaw: 0, plane: 0, condition: 100,
    wake: [], wakeTime: 0, bumps: 0, lastImpact: 0, impactDelay: 0, ...pose,
  };
}

export function hullOnWater(river, boat, x = boat.x, y = boat.y, a = boat.a) {
  // A tight row of circles follows the keel. A single circle would make a barge
  // as wide as it is long and close otherwise navigable arches.
  const r = boat.halfWidth * 1.04;
  const span = boat.halfLength - r;
  const steps = Math.ceil(2 * span / (r * 0.55));
  const dx = Math.cos(a), dy = Math.sin(a);
  for (let i = 0; i <= steps; i++) {
    const u = (2 * i / steps - 1) * span;
    if (!river.onWater(x + u * dx, y + u * dy, r)) return false;
  }
  return true;
}

function settle(boat) {
  boat.speed = boat.slideX = boat.slideY = boat.yaw = 0;
}

export function boardableBoat(boats, moorings, person) {
  return boats.find((boat) => boat.mooring && moorings.some((m) => m.id === boat.mooring && dist(m.quay, person) <= 11));
}

export function dockingMooring(boats, moorings, boat, clear = () => true) {
  if (Math.hypot(boat.slideX, boat.slideY) > 7.5) return null;
  let nearest = null, reach = Math.min(29, 16 + boat.halfWidth * 1.25);
  for (const m of moorings) {
    const gap = dist(boat, m);
    if (gap >= reach || boats.some((b) => b !== boat && b.mooring === m.id) || !clear(m.quay)) continue;
    nearest = m;
    reach = gap;
  }
  return nearest;
}

export function dockBoat(boat, mooring) {
  settle(boat);
  boat.mooring = mooring.id;
  return { ...mooring.quay, a: boat.a };
}

export function takeBoat(boat) {
  const theft = !boat.claimed;
  boat.claimed = true;
  boat.mooring = null;
  return theft;
}

function hitBoat(boat, force) {
  if (force < 3 || boat.impactDelay > 0) return;
  boat.bumps++;
  boat.lastImpact = force;
  boat.impactDelay = 0.4;
  // Even a battered hull can limp back to a quay.
  if (force > 23) boat.condition = Math.max(20, boat.condition - Math.ceil((force - 23) * 0.42));
}

function contactAt(boat, x, y, a, boats) {
  const pose = { x, y, a, halfLength: boat.halfLength, halfWidth: boat.halfWidth };
  for (const other of boats) {
    if (other === boat || other.incoming) continue;
    const hit = carContact(pose, other);
    if (hit) return { ...hit, other };
  }
  return null;
}

export function driveBoat(river, boat, boats, dt, throttle, rudder) {
  const type = boatTypes[boat.model];
  const ca = Math.cos(boat.a), sa = Math.sin(boat.a);
  let forward = boat.slideX * ca + boat.slideY * sa;
  const sideways = (boat.slideY * ca - boat.slideX * sa) * Math.exp(-type.grip * dt);
  const pushingBack = forward * throttle < 0;
  forward += throttle * type.thrust * (pushingBack ? 1.65 : throttle < 0 ? 0.72 : 1) * dt;
  const maxSpeed = type.topSpeed * (0.45 + boat.condition * 0.0055);
  const planing = boat.model === "speedboat" && forward > 54;
  boat.plane += (Number(planing) - boat.plane) * (1 - Math.exp(-dt * 2));
  forward = clamp(forward * Math.exp(-type.drag * (1 - 0.48 * boat.plane) * dt), -maxSpeed * 0.38, maxSpeed);
  const flow = Math.abs(forward) > 1 ? Math.sign(forward) : Math.sign(throttle);
  const desiredYaw = rudder * flow * type.rudder * clamp((Math.abs(forward) + 9 * Math.abs(throttle)) / 17, 0, 1);
  boat.yaw += (desiredYaw - boat.yaw) * (1 - Math.exp(-dt * (1.4 + type.grip)));
  const heading = boat.a + boat.yaw * dt;
  if (hullOnWater(river, boat, boat.x, boat.y, heading) && !contactAt(boat, boat.x, boat.y, heading, boats))
    boat.a = heading;
  else boat.yaw *= Math.exp(-dt * 6);

  boat.slideX = forward * ca - sideways * sa;
  boat.slideY = forward * sa + sideways * ca;
  const nx = boat.x + boat.slideX * dt, ny = boat.y + boat.slideY * dt;
  if (!hullOnWater(river, boat, nx, ny)) {
    // Keep the tangential motion when scraping a quay or the side of a pier.
    const xFree = hullOnWater(river, boat, nx, boat.y);
    const yFree = hullOnWater(river, boat, boat.x, ny);
    const bounceX = !xFree || (yFree && Math.abs(boat.slideX) < Math.abs(boat.slideY));
    const vx = boat.slideX, vy = boat.slideY;
    if (!bounceX && !contactAt(boat, nx, boat.y, boat.a, boats)) boat.x = nx;
    if (bounceX && yFree && !contactAt(boat, boat.x, ny, boat.a, boats)) boat.y = ny;
    if (bounceX) boat.slideX *= -0.24;
    if (!bounceX || !yFree) boat.slideY *= -0.24;
    hitBoat(boat, Math.hypot(bounceX ? vx : 0, !bounceX || !yFree ? vy : 0));
  } else {
    const hit = contactAt(boat, nx, ny, boat.a, boats);
    if (hit) {
      const { other } = hit;
      const closing = Math.max(0,
        (other.slideX - boat.slideX) * hit.nx + (other.slideY - boat.slideY) * hit.ny);
      const inward = Math.max(0, -boat.slideX * hit.nx - boat.slideY * hit.ny);
      boat.slideX += (inward + closing * 0.18) * hit.nx;
      boat.slideY += (inward + closing * 0.18) * hit.ny;
      hitBoat(boat, closing);
      hitBoat(other, closing * Math.min(1, boat.mass / other.mass));
    } else {
      boat.x = nx;
      boat.y = ny;
    }
  }
  boat.speed = boat.slideX * Math.cos(boat.a) + boat.slideY * Math.sin(boat.a);
}

function berthFleet(river, office) {
  const berths = [...river.moorings].sort((a, b) => dist(office, a.quay) - dist(office, b.quay));
  const boats = [];
  for (const model of ["launch", "speedboat", "barge", "riverboat"]) {
    // A long hull sometimes needs to sit farther out than the berth marker.
    const limit = model === "launch" ? Math.min(1, berths.length) : berths.length;
    for (let i = 0; i < limit; i++) {
      const m = berths[i];
      const boat = makeBoat(model, { x: m.x, y: m.y, a: m.a, mooring: m.id, claimed: model === "launch" });
      const side = Math.sign(m.y - m.quay.y);
      for (const shift of [0, 3, 6, 10, 14, 18]) {
        boat.y = m.y + side * shift;
        if (hullOnWater(river, boat) && !contactAt(boat, boat.x, boat.y, boat.a, boats)) break;
      }
      if (!hullOnWater(river, boat) || contactAt(boat, boat.x, boat.y, boat.a, boats)) continue;
      boats.push(boat);
      berths.splice(i, 1);
      break;
    }
  }
  return boats;
}

// Lay out continuous starboard lanes at startup. At each cross-section prefer
// the centreline offset, but scout nearby water for island and pier clearances.
function makeLane(river, moored, sign) {
  const hull = makeBoat("barge", {});
  // Two units wider than the widest hull: a lane that grazes a pier or a wall holds up
  // whichever boat samples that stone a little differently from the scout.
  hull.halfWidth = Math.max(hull.halfWidth, boatTypes.riverboat.beam * metre / 2) + 2;
  const knots = river.centreline;
  if (knots.length < 2) return [];
  const west = knots[0].x + hull.halfLength + 2;
  const east = knots.at(-1).x - hull.halfLength - 2;
  if (west >= east) return [];
  const segments = Math.ceil((east - west) / 16);
  const laneGap = clamp((river.bottom - river.top) / 30 - 2.5, 1.5, 9);
  let previous = new Map(), knot = 0;
  for (let i = 0; i <= segments; i++) {
    const x = west + (east - west) * i / segments;
    while (knots[knot + 1].x < x) knot++;
    const a = knots[knot], b = knots[knot + 1];
    const mid = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
    // The published centreline goes south of the island. Mirror its detour for westbound traffic.
    const channel = sign > 0 ? mid : river.top + river.bottom - mid;
    const preferred = channel + sign * (hull.halfWidth + laneGap);
    const column = new Map();
    for (let y = Math.ceil((river.top + hull.halfWidth) / 2) * 2; y <= river.bottom - hull.halfWidth; y += 2) {
      if (!river.onWater(x, y, hull.halfWidth)) continue;
      const weight = ((y - preferred) / 12) ** 2;
      let parent = null, cost = Infinity;
      for (let offset = i ? -12 : 0; offset <= (i ? 12 : 0); offset += 2) {
        const p = i ? previous.get(y + offset) : { x: x - 16, y, cost: 0 };
        if (!p) continue;
        // A bend costs by the square of its step, so a lane swings wide of a pier over
        // several lengths instead of jinking beside it: long hulls cannot follow a jink.
        const nextCost = p.cost + weight + offset * offset * 0.15;
        if (nextCost >= cost) continue;
        const angle = Math.atan2(y - p.y, x - p.x);
        if (!hullOnWater(river, hull, x, y, angle) || contactAt(hull, x, y, angle, moored)) continue;
        if (i) {
          const mx = (x + p.x) * 0.5, my = (y + p.y) * 0.5;
          if (!hullOnWater(river, hull, p.x, p.y, angle) || !hullOnWater(river, hull, mx, my, angle)) continue;
          if (contactAt(hull, p.x, p.y, angle, moored) || contactAt(hull, mx, my, angle, moored)) continue;
        }
        parent = i ? p : null;
        cost = nextCost;
      }
      if (cost < Infinity) column.set(y, { x, y, cost, parent });
    }
    if (!column.size) return [];
    previous = column;
  }
  const lane = [];
  const finish = [...previous.values()].reduce((best, p) => p.cost < best.cost ? p : best);
  for (let node = finish; node; node = node.parent) lane.push({ x: node.x, y: node.y });
  return lane.reverse();
}

function lanePose(lane, x, sign) {
  const f = (x - lane[0].x) / (lane.at(-1).x - lane[0].x) * (lane.length - 1);
  const i = clamp(Math.floor(f), 0, lane.length - 2);
  const a = lane[i], b = lane[i + 1], t = clamp(f - i, 0, 1);
  return { x, y: a.y + (b.y - a.y) * t, a: Math.atan2((b.y - a.y) * sign, (b.x - a.x) * sign) };
}

function narrowPassages(east, west) {
  if (!east.length || !west.length) return [];
  const gates = [];
  // Hold opposing bows a hull length away from the stretch where lanes converge.
  const clearance = boatTypes.barge.length * metre / 2 + 16;
  for (let i = 0; i < east.length; i++) {
    if (Math.abs(east[i].y - west[i].y) > boatTypes.riverboat.beam * metre + 2) continue;
    const x = east[i].x, last = gates.at(-1);
    if (last && x - clearance - last.right < clearance) last.right = x + clearance;
    else gates.push({ left: x - clearance, right: x + clearance, direction: 0, waiting: 0, inside: new Set() });
  }
  return gates;
}

export function createBoatFleet(river, office) {
  const boats = berthFleet(river, office);
  const east = makeLane(river, boats, 1), west = makeLane(river, boats, -1);
  const gates = narrowPassages(east, west);
  for (const [i, fraction] of [0.16, 0.4, 0.64, 0.87].entries()) {
    const sign = i % 2 ? -1 : 1, lane = sign > 0 ? east : west;
    if (!lane.length) continue;
    const x = lane[0].x + fraction * (lane.at(-1).x - lane[0].x);
    const boat = makeBoat(i < 2 ? "barge" : "riverboat", {
      ...lanePose(lane, x, sign), traffic: { lane, sign, hornDelay: 0 },
    });
    const gate = gates.find((g) => x + boat.halfLength > g.left && x - boat.halfLength < g.right);
    if (contactAt(boat, boat.x, boat.y, boat.a, boats) || (gate?.direction && gate.direction !== sign)) {
      boat.incoming = 1 + i;
    } else if (gate) {
      gate.direction = sign;
      gate.inside.add(boat);
    }
    boats.push(boat);
  }
  return { boats, gates };
}

function aheadOfGate(boat, gate) {
  const edge = boat.traffic.sign > 0 ? gate.left : gate.right;
  return (edge - boat.x) * boat.traffic.sign - boat.halfLength;
}

function reserve(gate, boat) {
  if (gate.inside.has(boat)) return true;
  const { sign } = boat.traffic;
  if (gate.direction === -sign || gate.waiting === -sign) {
    if (gate.direction === -sign) gate.waiting = sign;
    return false;
  }
  gate.direction = sign;
  gate.waiting = 0;
  gate.inside.add(boat);
  return true;
}

function trafficStep(river, boat, fleet, dt, horn) {
  const { lane, sign } = boat.traffic;
  const end = sign > 0 ? lane.at(-1).x : lane[0].x;
  if (boat.incoming) {
    boat.incoming = Math.max(0.001, boat.incoming - dt);
    if (boat.incoming > 0.001) return;
    const start = sign > 0 ? lane[0].x : lane.at(-1).x;
    const next = lanePose(lane, start, sign);
    if (contactAt(boat, next.x, next.y, next.a, fleet.boats)) return;
    const gate = fleet.gates.find((g) => start + boat.halfLength > g.left && start - boat.halfLength < g.right);
    if (gate && !reserve(gate, boat)) return;
    Object.assign(boat, next, { incoming: 0 });
  }

  const cruise = boatTypes[boat.model].topSpeed * 0.78;
  let target = cruise;
  const gate = fleet.gates.find((g) => sign > 0 ? boat.x - boat.halfLength < g.right : boat.x + boat.halfLength > g.left);
  if (gate) {
    const distance = aheadOfGate(boat, gate);
    if (distance < 32 && !reserve(gate, boat))
      target = Math.min(target, Math.max(0, (distance - 4) * 0.8));
  }

  let close = false;
  for (const other of fleet.boats) {
    if (other === boat || other.incoming) continue;
    const ahead = (other.x - boat.x) * sign;
    const gap = ahead - boat.halfLength - other.halfLength;
    if (ahead <= 0 || gap > 55) continue;
    const y = lanePose(lane, other.x, sign).y;
    if (Math.abs(y - other.y) > boat.halfWidth + other.halfWidth) continue;
    close = true;
    target = Math.min(target, Math.max(0, sign * other.slideX + (gap - 8) * 0.55));
  }
  boat.traffic.hornDelay = Math.max(0, boat.traffic.hornDelay - dt);
  if ((close || target < cruise * 0.6) && !boat.traffic.hornDelay) {
    boat.traffic.hornDelay = 4;
    horn(boat);
  }
  boat.speed += clamp(target - boat.speed, -22 * dt, (boat.model === "barge" ? 4 : 6) * dt);
  if (!boat.speed) {
    settle(boat);
    return;
  }
  const x = boat.x + sign * boat.speed * dt;
  if ((end - x) * sign <= 0) {
    settle(boat);
    boat.wake.length = 0;
    boat.incoming = 2;
    return;
  }
  const next = lanePose(lane, x, sign);
  if (!hullOnWater(river, boat, next.x, next.y, next.a) || contactAt(boat, next.x, next.y, next.a, fleet.boats)) {
    settle(boat);
    return;
  }
  boat.slideX = (next.x - boat.x) / dt;
  boat.slideY = (next.y - boat.y) / dt;
  Object.assign(boat, next);
}

function updateWake(boat, dt) {
  for (const point of boat.wake) point.age += dt;
  while (boat.wake[0]?.age >= 2.4) boat.wake.shift();
  const speed = Math.hypot(boat.slideX, boat.slideY);
  boat.wakeTime -= dt;
  if (speed < 4 || boat.wakeTime > 0) return;
  boat.wakeTime = speed > 50 ? 0.047 : 0.12;
  const a = boat.a + (boat.speed < 0 ? Math.PI : 0);
  const stern = boat.halfLength * 0.92;
  boat.wake.push({
    x: boat.x - stern * Math.cos(a), y: boat.y - stern * Math.sin(a),
    a, age: 0, power: clamp(speed / 58 + boat.plane * 0.3, 0.1, 1),
  });
}

export function updateBoats(river, fleet, dt, ride, throttle, rudder, horn = () => {}) {
  if (dt <= 0) return;
  for (const gate of fleet.gates) {
    for (const boat of gate.inside) {
      const cleared = boat.traffic.sign > 0 ? boat.x - boat.halfLength >= gate.right : boat.x + boat.halfLength <= gate.left;
      if (cleared || boat.incoming) gate.inside.delete(boat);
    }
    if (!gate.inside.size) gate.direction = 0;
  }
  for (const boat of fleet.boats) boat.impactDelay = Math.max(0, boat.impactDelay - dt);
  if (ride?.domain === "water") driveBoat(river, ride, fleet.boats, dt, throttle, rudder);
  for (const boat of fleet.boats) {
    if (boat.traffic) trafficStep(river, boat, fleet, dt, horn);
    updateWake(boat, dt);
  }
}

export const river = town.river;
export const boatFleet = createBoatFleet(river, town.byId.get("office"));
