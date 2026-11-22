import test from "node:test";
import assert from "node:assert/strict";
import { town, definition } from "../src/world/town.js";
import { buildTown } from "../src/world/layout.js";
import { blockedIn } from "../src/world/collision.js";
import {
  CAR_LENGTH,
  carriagesOf,
  doorsOpenAt,
  fallbackRing,
  nextStop,
  prepareRing,
  rideRequest,
  rideStep,
  ringOf,
  ringReplacesLineTrains,
  timetable,
  trainsetAt,
} from "../src/game/ring-route.js";

const ring = ringOf(town);
const tt = timetable(ring);
const gap = (a, b) => (((b - a) % ring.length) + ring.length) % ring.length;

test("the fallback ring is a closed clockwise loop inside the town with four reachable stations", () => {
  assert.equal(ring.fallback, true);
  assert.equal(ringReplacesLineTrains(town), false);
  const start = ring.pointAt(0),
    end = ring.pointAt(ring.length);
  assert.ok(Math.hypot(start.x - end.x, start.y - end.y) < 1e-6, "arc length wraps onto the start");
  // Positive shoelace area in screen coordinates (y down) means clockwise on screen.
  let area = 0;
  for (let i = 0; i < ring.points.length; i++) {
    const a = ring.points[i],
      b = ring.points[(i + 1) % ring.points.length];
    area += a.x * b.y - b.x * a.y;
  }
  assert.ok(area > 0, "clockwise");
  for (const q of ring.points) assert.ok(q.x > 0 && q.x < town.width && q.y > 0 && q.y < town.height);
  assert.equal(ring.stations.length, 4);
  for (const st of ring.stations) {
    assert.equal(blockedIn(town, st.street.x, st.street.y, 2.6), false, st.id + " stair foot is walkable");
    const q = ring.pointAt(st.s);
    assert.ok(Math.hypot(q.x - st.stop.x, q.y - st.stop.y) < 1, st.id + " platform lies on the loop");
  }
});

test("a published ring replaces the fallback and the old line trains", () => {
  const points = [
    { x: 100, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 700 },
    { x: 100, y: 700 },
  ];
  const published = { ...buildTown(definition) };
  published.ring = {
    points,
    length: 2800,
    deckLift: 52,
    stations: [
      { id: "b", name: { fr: "B", en: "B" }, s: 1400, stop: { x: 900, y: 600 }, street: { x: 920, y: 600 } },
      { id: "a", name: { fr: "A", en: "A" }, s: 400, stop: { x: 500, y: 100 }, street: { x: 500, y: 120 } },
    ],
  };
  const r = ringOf(published);
  assert.equal(r.fallback, false);
  assert.equal(r.length, 2800);
  assert.equal(r.deckLift, 52);
  assert.deepEqual(r.stations.map((s) => s.id), ["a", "b"], "stations sorted along the loop");
  assert.equal(ringReplacesLineTrains(published), true);
  // A loop closed by repeating its first point measures the same.
  assert.equal(prepareRing({ ...published.ring, points: [...points, points[0]] }).length, 2800);
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
      // At full speed on the 70-unit fallback curves the heading turns about 0.13 rad per 0.1 s.
      assert.ok(turn < 0.2, `heading step ${turn} at ${t}`);
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
  const result = rideRequest(tt, { phase: "riding", set: 0, car: 1, boardedAt: (st.station + 3) % 4, alightAt: null }, t);
  assert.equal(result.event, "alighted");
  assert.equal(result.station, st.station);
  // Without a request the rider stays aboard through every stop.
  let ride = { phase: "riding", set: 0, car: 1, boardedAt: 0, alightAt: null };
  for (let u = 0; u < tt.period; u += 0.2) assert.equal(rideStep(tt, ride, u).ride, ride);
});

test("the fallback grows with the town", () => {
  const blocks = Array.from({ length: 10 }, (_, row) => Array.from({ length: 14 }, (_, col) => (row === 3 ? "docks" : col % 2 ? "garage" : "square")));
  const big = buildTown({ ...definition, blocks, canalRow: 4, railways: [], addresses: definition.addresses, interiors: definition.interiors });
  const r = prepareRing(fallbackRing(big));
  assert.ok(r.length > ring.length * 1.8);
  const bigTable = timetable(r);
  assert.equal(bigTable.sets, 3);
});
