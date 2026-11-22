import { compileNodeCycle, evalSegment } from "../world/routes.js";
import { vehicleBlockedIn } from "../world/collision.js";
import { fleetOf } from "./fleet.js";

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
