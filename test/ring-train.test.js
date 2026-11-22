import test from "node:test";
import assert from "node:assert/strict";
import { town } from "../src/world/town.js";
import { blockedIn } from "../src/world/collision.js";
import {
  CAR_HALF_WIDTH,
  CAR_LENGTH,
  carriagesOf,
  doorsOpenAt,
  nextStop,
  platformSpot,
  prepareRing,
  rideRequest,
  rideStep,
  ringOf,
  timetable,
  trainsetAt,
} from "../src/game/ring-route.js";

const ring = ringOf(town);
const tt = timetable(ring);
const gap = (a, b) => (((b - a) % ring.length) + ring.length) % ring.length;
const n = ring.stations.length;
// Distance from a point to the track's centre line.
const offTrack = (q) => {
  const at = ring.pointAt(ring.project(q));
  return Math.hypot(at.x - q.x, at.y - q.y);
};

test("trains run on the town's published Petite Ceinture: a clockwise loop with eight stations", () => {
  assert.equal(ringOf(town), ring, "one prepared ring per town");
  assert.equal(ring.deckLift, town.ring.deckLift);
  assert.ok(Math.abs(ring.length - town.ring.length) < 0.1, "same length as the published loop");
  let area = 0;
  for (let i = 0; i < ring.points.length; i++) {
    const a = ring.points[i],
      b = ring.points[(i + 1) % ring.points.length];
    area += a.x * b.y - b.x * a.y;
  }
  assert.ok(area > 0, "clockwise on screen");
  assert.deepEqual(
    ring.stations.map((s) => s.id),
    town.ring.stations.map((s) => s.id),
    "stations in the town's order along the loop",
  );
  assert.equal(n, 8);
  for (const st of ring.stations) {
    assert.equal(blockedIn(town, st.street.x, st.street.y, 2.6), false, st.id + " stair foot is walkable");
    const q = ring.pointAt(st.s);
    assert.ok(Math.hypot(q.x - st.stop.x, q.y - st.stop.y) < 1, st.id + " platform lies on the loop");
    // The platform is on the same side of the track as the stair foot.
    const spot = platformSpot(ring, st),
      pose = ring.poseAt(st.s, 4);
    const sideOf = (o) => -Math.sin(pose.a) * (o.x - pose.x) + Math.cos(pose.a) * (o.y - pose.y);
    assert.ok(sideOf(spot) * sideOf(st.street) > 0, st.id + " platform faces its stair");
    assert.ok(offTrack(spot) > CAR_HALF_WIDTH + 2, st.id + " platform stands clear of the coaches");
  }
  // A loop closed by repeating its first point measures the same.
  assert.ok(Math.abs(prepareRing({ ...town.ring, points: [...ring.points, ring.points[0]] }).length - ring.length) < 1e-6);
  assert.throws(() => ringOf({}), /no ring/);
});

test("every carriage stays over the deck, through the corners too", () => {
  let worstCentre = 0,
    worstEnd = 0;
  for (let s = 0; s < ring.length; s += 5) {
    const pose = ring.poseAt(s);
    worstCentre = Math.max(worstCentre, offTrack(pose));
    for (const end of [-1, 1])
      for (const side of [-1, 1]) {
        const u = (end * CAR_LENGTH) / 2,
          v = side * CAR_HALF_WIDTH;
        const corner = { x: pose.x + Math.cos(pose.a) * u - Math.sin(pose.a) * v, y: pose.y + Math.sin(pose.a) * u + Math.cos(pose.a) * v };
        worstEnd = Math.max(worstEnd, offTrack(corner));
      }
  }
  // The deck is 14.5 units wide; the coach 13.
  assert.ok(worstCentre < 3.5, "carriage centre sags " + worstCentre.toFixed(2) + " off the track");
  assert.ok(worstEnd < 7.25 + 3, "carriage corner swings " + worstEnd.toFixed(2) + " from the track");
});

test("trains slow down for the corners", () => {
  const corner = (q) =>
    (q.x < town.ring.left + town.ring.cornerR || q.x > town.ring.right - town.ring.cornerR) &&
    (q.y < town.ring.top + town.ring.cornerR || q.y > town.ring.bottom - town.ring.cornerR);
  let cornerTop = 0,
    straightTop = 0;
  for (let t = 0; t < tt.period; t += 0.1) {
    const st = trainsetAt(tt, 0, t);
    const inCorner = carriagesOf(tt, st).some((c) => corner(c));
    if (inCorner) cornerTop = Math.max(cornerTop, st.v);
    else straightTop = Math.max(straightTop, st.v);
  }
  assert.ok(straightTop > tt.vmax - 1, "full line speed on the straights: " + straightTop);
  assert.ok(cornerTop > 20 && cornerTop < 0.6 * tt.vmax, "corner speed " + cornerTop);
});

test("every trainset stops at every station, doors open, then leaves", () => {
  for (let k = 0; k < tt.sets; k++) {
    const visits = new Map();
    for (let t = 0; t < tt.period; t += 0.1) {
      const st = trainsetAt(tt, k, t);
      if (st.station < 0) continue;
      assert.ok(Math.abs(gap(ring.stations[st.station].s, st.s)) < 1e-6 || gap(ring.stations[st.station].s, st.s) > ring.length - 1e-6);
      assert.equal(st.v, 0);
      const v = visits.get(st.station) ?? { time: 0, doors: 0 };
      v.time += 0.1;
      if (st.doors) v.doors += 0.1;
      visits.set(st.station, v);
    }
    assert.equal(visits.size, ring.stations.length, "trainset " + k + " calls everywhere");
    for (const [i, v] of visits) {
      assert.ok(Math.abs(v.time - tt.dwell) < 0.25, `dwell at ${i}: ${v.time}`);
      assert.ok(v.doors > tt.dwell - tt.doorsOpen - tt.doorsClose - 0.25, `doors at ${i}: ${v.doors}`);
    }
  }
});

test("trains move continuously, within the speed limit, and keep their distance", () => {
  const dt = 0.05;
  let before = Array.from({ length: tt.sets }, (_, k) => trainsetAt(tt, k, 0));
  for (let t = dt; t < 2 * tt.period; t += dt) {
    const now = Array.from({ length: tt.sets }, (_, k) => trainsetAt(tt, k, t));
    for (let k = 0; k < tt.sets; k++) {
      const moved = gap(before[k].s, now[k].s);
      assert.ok(moved <= tt.vmax * dt + 1e-6, `trainset ${k} jumped ${moved} at ${t}`);
      assert.ok(now[k].v <= tt.vmax + 1e-9);
      // The next trainset ahead is always at least a train length and a margin away.
      const ahead = now[(k + tt.sets - 1) % tt.sets];
      assert.ok(gap(now[k].s, ahead.s) > tt.trainLength + 60, `spacing ${k} at ${t}`);
    }
    before = now;
  }
});

test("carriages trail the leading cab and turn smoothly through a corner", () => {
  let previous;
  for (let t = 0; t < tt.period; t += 0.1) {
    const cars = carriagesOf(tt, trainsetAt(tt, 0, t));
    assert.equal(cars[0].cab, "front");
    assert.equal(cars.at(-1).cab, "rear");
    for (let i = 1; i < cars.length; i++) {
      const d = Math.hypot(cars[i].x - cars[i - 1].x, cars[i].y - cars[i - 1].y);
      assert.ok(d > CAR_LENGTH * 0.9 && d < CAR_LENGTH * 1.1, "coupled carriages stay a car length apart");
    }
    if (previous) {
      const turn = Math.abs(Math.atan2(Math.sin(cars[0].a - previous), Math.cos(cars[0].a - previous)));
      // Slowed for the 150-unit curves, the heading turns well under 0.1 rad per 0.1 s.
      assert.ok(turn < 0.1, `heading step ${turn} at ${t}`);
    }
    previous = cars[0].a;
  }
});

test("boarding: wait on the platform, board when the doors open, ask for the next stop, step off there", () => {
  const station = 0;
  let ride = { phase: "platform", station };
  // Find the first moment a train's doors open at the platform.
  let t = 0;
  for (; t < tt.period; t += 0.1) {
    const result = rideStep(tt, ride, t);
    if (result.event === "boarded") {
      ride = result.ride;
      break;
    }
    assert.equal(result.ride, ride, "still waiting");
  }
  assert.equal(ride.phase, "riding");
  assert.equal(ride.boardedAt, station);
  assert.equal(doorsOpenAt(tt, ride, t), station, "doors still open after boarding");
  assert.equal(nextStop(tt, ride, t), 1, "the next stop is the following station");
  // Ride until the train is moving, then request a stop.
  while (trainsetAt(tt, ride.set, t).station >= 0) t += 0.1;
  const request = rideRequest(tt, ride, t);
  assert.equal(request.event, "alightRequested");
  assert.equal(request.station, 1);
  ride = request.ride;
  let arrived;
  for (const limit = t + tt.period; t < limit; t += 0.1) {
    const result = rideStep(tt, ride, t);
    if (result.event) {
      arrived = result;
      break;
    }
  }
  assert.equal(arrived.event, "alighted");
  assert.equal(arrived.station, 1);
  assert.equal(arrived.boardedAt, station);
  assert.equal(arrived.ride, null);
  const train = trainsetAt(tt, ride.set, t);
  assert.ok(train.doors && train.station === 1, "steps off through open doors at the stop");
});

test("boarding: the car key leaves the platform, or steps off at once while the doors are open", () => {
  assert.deepEqual(rideRequest(tt, { phase: "platform", station: 2 }, 5), { ride: null, event: "leftPlatform", station: 2 });
  let t = 0;
  while (!trainsetAt(tt, 0, t).doors) t += 0.1;
  const st = trainsetAt(tt, 0, t);
  const result = rideRequest(tt, { phase: "riding", set: 0, car: 1, boardedAt: (st.station + 3) % n, alightAt: null }, t);
  assert.equal(result.event, "alighted");
  assert.equal(result.station, st.station);
  // Without a request the rider stays aboard through every stop.
  let ride = { phase: "riding", set: 0, car: 1, boardedAt: 0, alightAt: null };
  for (let u = 0; u < tt.period; u += 0.2) assert.equal(rideStep(tt, ride, u).ride, ride);
});
