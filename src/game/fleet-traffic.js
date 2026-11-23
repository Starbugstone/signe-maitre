import { buildTrafficLoop, compileNodeCycle, evalSegment } from "../world/routes.js";
import { vehicleBlockedIn } from "../world/collision.js";
import { fleet, fleetOf, pickModel, trafficPercent } from "./fleet.js";

// Plan against the whole road graph so streaming order and viewport size cannot change a cell's model.
export function planTraffic(town) {
  const slots = new Map();
  const streets = [];
  for (let row = 0; row < town.rows - 1; row++) {
    for (let col = 0; col < town.cols - 1; col++) {
      const meta = town.cellMeta(col, row);
      if ((meta.isRiverRow && !meta.isIsland) || (col + row * 2) % 5 === 4) continue;
      const loop = buildTrafficLoop(town, col, row) ??
        buildTrafficLoop(town, col, row, { maxHalfWidth: fleet.moto.halfWidth });
      if (!loop) continue;
      const slot = { loop, x: town.roadsX[col], y: town.roadsY[row] };
      slots.set(col + "," + row, slot);
      if (loop.class === "alley") slot.model = pickModel("alley", () => 0);
      else streets.push(slot);
    }
  }

  const models = Object.keys(trafficPercent).filter((model) => trafficPercent[model].moving > 0)
    .sort((a, b) => trafficPercent[a].moving - trafficPercent[b].moving);
  const batchSize = Math.ceil(100 / trafficPercent[models[0]].moving);
  const assigned = Object.fromEntries(models.map((model) => [model, 0]));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cityCentre = { x: town.width / 2, y: town.height / 2 };
  const remaining = new Set(streets);
  while (remaining.size) {
    const anchor = [...remaining].reduce((best, slot) => distance(slot, cityCentre) < distance(best, cityCentre) ? slot : best);
    const batch = [...remaining].sort((a, b) => distance(a, anchor) - distance(b, anchor)).slice(0, batchSize);
    const total = streets.length - remaining.size + batch.length;
    const centre = {
      x: batch.reduce((sum, slot) => sum + slot.x, 0) / batch.length,
      y: batch.reduce((sum, slot) => sum + slot.y, 0) / batch.length,
    };
    for (const slot of batch) remaining.delete(slot);
    batch.sort((a, b) => distance(a, centre) - distance(b, centre));
    // Give each model a place in a full neighbourhood, then repay the largest citywide shortfall.
    for (const model of batch.length >= models.length ? models : []) {
      batch.shift().model = model;
      assigned[model]++;
    }
    for (const slot of batch) {
      const deficit = (model) => total * trafficPercent[model].moving / 100 - assigned[model];
      slot.model = models.reduce((best, model) => deficit(model) > deficit(best) ? model : best);
      assigned[slot.model]++;
    }
  }
  return slots;
}

// Long bodies use gentler approaches and a wider orbit so their ends clear the island
// before they swing across the entry and exit lanes.
export function compileFleetLoop(town, loop, model) {
  const { halfLength, halfWidth, turn, pivot, traffic } = fleetOf({ model });
  if (!traffic.lanes.includes(loop.class)) return null;
  if (loop.class === "alley") {
    // Where a seam alley passes a painted pier, the bike stays nearer the centre.
    for (const laneOffset of [2.5, 1]) {
      const segments = laneOffset === 2.5 ? loop.segments : compileNodeCycle(town, loop.nodeIds, { laneOffset });
      const clear = (seg) => {
        const samples = Math.ceil(seg.length / 2);
        for (let i = 0; i <= samples; i++) {
          const pose = evalSegment(seg, (i / samples) * seg.length);
          if (vehicleBlockedIn(town, { ...pose, halfLength, halfWidth })) return false;
        }
        return true;
      };
      if (segments.every(clear)) return segments;
    }
    return null;
  }
  if (!pivot) return loop.segments;
  return compileNodeCycle(town, loop.nodeIds, {
    laneOffset: 5.8,
    turnRadius: turn,
    filletRadius: model === "bus" ? 48 : 26,
    ringOffset: 2,
  });
}

// What the larger vehicles do in traffic beyond following their route.

const stopSpacing = 240,
  stopTime = 3.4;

// A line bus pulls up every few hundred units on a straight, waits for its passengers
// and moves off again. Returns the speed the driver wants this tick.
export function busStop(c, route, probe, desired, dt) {
  route.stopIn ??= 70 + ((route.id * 53) % 130);
  if (route.stopFor > 0) {
    // Doors open: the wait only runs once the bus has actually come to rest.
    if (route.speed < 0.5) route.stopFor -= dt;
    if (route.stopFor <= 0) {
      route.stopFor = 0;
      route.stopIn = stopSpacing;
      route.wait = 0;
      return desired;
    }
    return 0;
  }
  route.stopIn -= route.speed * dt;
  // Never in a junction or on its approach, and not while out passing.
  const clearRoad =
    probe.seg.roadClass === "avenue" && !probe.turning &&
    probe.remaining > 58 + c.halfLength && route.lane === 0 && route.laneTarget === 0;
  if (route.stopIn <= 0 && clearRoad && probe.s > 43 + c.halfLength) {
    route.stopFor = stopTime;
    return 0;
  }
  return desired;
}
