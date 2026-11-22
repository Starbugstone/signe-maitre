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
  const clearRoad = probe.arc === 0 && probe.remaining > 70 + c.halfLength && route.lane === 0 && route.laneTarget === 0;
  if (route.stopIn <= 0 && clearRoad && distanceFromLast(route, probe) > 50 + c.halfLength) {
    route.stopFor = stopTime;
    return 0;
  }
  return desired;
}

// How far the bus has come since the last corner, so its tail is clear of the junction.
function distanceFromLast(route, probe) {
  const points = route.points,
    before = points[(route.to + points.length - 1) % points.length];
  return Math.abs(route.px - before.x) + Math.abs(route.py - before.y);
}
