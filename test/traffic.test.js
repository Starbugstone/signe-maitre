import test from "node:test";
import assert from "node:assert/strict";

const { game, p, cars, people, held } = await import("../src/core/state.js");
const { update } = await import("../src/game/simulation.js");
const { X, Y, CELL_W, CELL_H, town } = await import("../src/world/town.js");

const { fleet } = await import("../src/game/fleet.js");
const { compileFleetLoop } = await import("../src/game/fleet-traffic.js");
const { advanceTraffic } = await import("../src/game/driving.js");
const { vehicleBlocked } = await import("../src/world/collision.js");
const { buildTrafficLoop, evalSegment } = await import("../src/world/routes.js");

// Stand in key blocks (ordinary cross streets, all four roundabouts, and river bridges) and let
// traffic run for over two minutes: no car may lock up, on screen or off it.
for (const [label, cx, cy, px, py, seconds] of [
  ["central block 7,5", X(7) + CELL_W / 2, Y(5) + CELL_H / 2, X(7) + CELL_W / 2, Y(5) + CELL_H / 2, 180],
  ["Star roundabout 3,3", X(3), Y(3), X(3) + 60, Y(3) - 24, 150],
  ["Obelisk roundabout 6,5", X(6), Y(5), X(6) + 60, Y(5) - 24, 150],
  ["Timbre roundabout 13,2", X(13), Y(2), X(13) + 60, Y(2) - 24, 150],
  ["Rive-Sud roundabout 10,10", X(10), Y(10), X(10) + 60, Y(10) - 24, 150],
  ["Pont de la Contrainte bridge col 6", X(6), Y(7), X(6) + 60, Y(6) - 24, 150],
  ["Île de la Ferre bridges cols 8 & 10", X(9), Y(7), X(9), Y(7) - 24, 150],
]) {
  test(`traffic around ${label} never locks up over ${seconds} seconds`, () => {
    game.sound = false;
    game.ride = null;
    p.x = px;
    p.y = py;
    game.camX = cx;
    game.camY = cy;
    game.vw = 360;
    game.vh = 240;
    const stopped = new Map();
    let longest = 0;
    for (let frame = 0; frame < seconds * 60; frame++) {
      update(1 / 60);
      for (const c of cars) {
        if (!c.route) continue;
        const time = (c.speed || 0) < 0.5 ? (stopped.get(c) || 0) + 1 / 60 : 0;
        stopped.set(c, time);
        longest = Math.max(longest, time);
      }
    }
    assert.ok(stopped.size >= 4, `only ${stopped.size} cars were simulated around ${label}`);
    assert.ok(longest < 20, `a car stayed stopped for ${longest.toFixed(1)} s around ${label}`);
  });
}

test("traffic keeps moving round a player standing in the middle of a junction", () => {
  game.ride = null;
  const { roadsX, roadsY } = town;
  Object.assign(p, { x: roadsX[7], y: roadsY[5], stuck: 0 });
  game.camX = p.x;
  game.camY = p.y;
  const stopped = new Map();
  let longest = 0;
  for (let frame = 0; frame < 120 * 60; frame++) {
    update(1 / 60);
    for (const c of cars) {
      if (!c.route) continue;
      const time = (c.speed || 0) < 0.5 ? (stopped.get(c) || 0) + 1 / 60 : 0;
      stopped.set(c, time);
      longest = Math.max(longest, time);
    }
  }
  assert.ok(longest < 30, `a car stayed stopped for ${longest.toFixed(1)} s`);
});

test("the étude sedan left across a junction is towed home and traffic moves again", async () => {
  const { sedan } = await import("../src/world/population.js");
  const { roadsX, roadsY } = town;
  game.ride = null;
  Object.assign(sedan, { x: roadsX[8], y: roadsY[5] + 2, a: 0.4, speed: 0, slideX: 0, slideY: 0 });
  if (!cars.includes(sedan)) cars.push(sedan);
  Object.assign(p, { x: roadsX[8] + 35, y: roadsY[5] + 24, stuck: 0 });
  game.camX = roadsX[8];
  game.camY = roadsY[5];
  const stopped = new Map();
  let longest = 0;
  for (let frame = 0; frame < 120 * 60; frame++) {
    update(1 / 60);
    for (const c of cars) {
      if (!c.route) continue;
      const time = (c.speed || 0) < 0.5 ? (stopped.get(c) || 0) + 1 / 60 : 0;
      stopped.set(c, time);
      longest = Math.max(longest, time);
    }
  }
  assert.deepEqual([sedan.x, sedan.y], [sedan.home.x, sedan.home.y], "the sedan was towed back to the étude");
  assert.ok(longest < 30, `a car stayed stopped for ${longest.toFixed(1)} s`);
});

test("a player in a wider pocket between two wrecks and the south pavement's bollard line is lifted out", () => {
  game.ride = null;
  Object.assign(p, { x: 519.17, y: 319.56, stuck: 0 });
  update(0);
  cars.length = people.length = 0;
  cars.push({ x: 506.87, y: 314.14, a: -0.15, condition: 0 }, { x: 533.01, y: 314.22, a: 0.15, condition: 0 });
  for (const dir of ["up", "left", "right", "down"]) {
    held.add(dir, "test");
    try {
      for (let i = 0; i < 90; i++) update(1 / 60);
    } finally {
      held.clear();
    }
  }
  assert.ok(Math.hypot(p.x - 519.17, p.y - 319.56) > 12, `still in the pocket at ${p.x},${p.y}`);
});

test("a player boxed into a clear pocket between two wrecks and the south pavement's bollard line is lifted out", () => {
  game.ride = null;
  game.time = 0;
  Object.assign(p, { x: 520, y: 319.8, stuck: 0 });
  game.camX = p.x;
  game.camY = p.y;
  update(0);
  cars.length = people.length = 0;
  cars.push({ x: 508.45, y: 314, a: -0.15, condition: 0 }, { x: 531.55, y: 314, a: 0.15, condition: 0 });
  held.add("up", "test");
  try {
    for (let i = 0; i < 120; i++) update(1 / 60);
  } finally {
    held.clear();
  }
  assert.ok(Math.hypot(p.x - 520, p.y - 319.8) > 2, `still pinned at ${p.x},${p.y}`);
});

function driveFleetLoop(model, loop, visit) {
  const { halfLength, halfWidth } = fleet[model];
  const segments = compileFleetLoop(town, loop, model);
  assert.ok(segments, `${model} needs a usable ${loop.class} loop`);
  const savedCars = cars.splice(0);
  const savedPeople = people.splice(0);
  const savedRide = game.ride;
  const c = {
    ...evalSegment(segments[0], 0),
    model, halfLength, halfWidth, condition: 100, speed: 0,
    route: { class: loop.class, segments, segIndex: 0, s: 0, pace: 36 },
  };
  cars.push(c);
  const visited = new Set();
  let stopped = 0;
  try {
    game.ride = c;
    for (let frame = 0; frame < 150 * 60; frame++) {
      advanceTraffic(c, 1 / 60);
      assert.ok(!vehicleBlocked(c), `${model} clips scenery on ${loop.nodeIds.join(", ")} at segment ${c.route.segIndex}`);
      visited.add(c.route.segIndex);
      stopped = c.speed < 0.5 ? stopped + 1 : 0;
      assert.ok(stopped < 5 * 60, `${model} wedged for 5 seconds at segment ${c.route.segIndex}`);
      visit(c, segments[c.route.segIndex]);
    }
    assert.equal(visited.size, segments.length, `${model} completes its circuit`);
  } finally {
    cars.splice(0, cars.length, ...savedCars);
    people.push(...savedPeople);
    game.ride = savedRide;
  }
}

for (const model of ["bus", "dumper"]) {
  for (const node of town.roads.nodes.filter((n) => n.kind === "roundabout")) {
    test(`${model} circulates at ${node.id} for 150 seconds`, () => {
      const loop = buildTrafficLoop(town, node.col, node.row, { maxHalfWidth: fleet[model].halfWidth });
      assert.notEqual(loop.class, "alley");
      let circulated = false;
      driveFleetLoop(model, loop, (c, seg) => {
        if (seg.roundabout?.id === node.id) {
          assert.ok(seg.deltaA < 0);
          circulated = true;
        }
        if (c.route.stopFor > 0) assert.equal(seg.roadClass, "avenue");
      });
      assert.ok(circulated);
    });
  }

  test(`${model} crosses la Ferre for 150 seconds`, () => {
    const loop = buildTrafficLoop(town, 6, 6, { maxHalfWidth: fleet[model].halfWidth });
    const positions = new Set();
    let stoppedOnAvenue = false;
    driveFleetLoop(model, loop, (c, seg) => {
      if (c.y > town.river.top && c.y < town.river.bottom) {
        const bridge = town.river.bridges.find((b) => Math.abs(c.x - b.x) < b.halfWidth);
        assert.ok(bridge);
        positions.add(bridge.col);
      }
      if (c.route.stopFor > 0) {
        assert.equal(seg.roadClass, "avenue");
        stoppedOnAvenue ||= c.speed < 0.5;
      }
    });
    assert.ok(positions.has(6));
    if (model === "bus") assert.ok(stoppedOnAvenue, "the bus actually rested at an avenue stop");
  });
}

test("a motorbike completes an alley loop and a sedan is refused", () => {
  const { halfLength, halfWidth } = fleet.moto;
  const loop = buildTrafficLoop(town, 10, 3, { maxHalfWidth: halfWidth });
  assert.equal(loop.class, "alley");
  assert.equal(compileFleetLoop(town, loop, "sedan"), null);
  assert.notEqual(buildTrafficLoop(town, 10, 3, { maxHalfWidth: fleet.sedan.halfWidth })?.class, "alley");
  const alley = loop.segments.find((seg) => seg.roadClass === "alley" && seg.length > 60);
  const mid = evalSegment(alley, alley.length / 2);
  assert.equal(vehicleBlocked({ ...mid, halfLength, halfWidth }), false);
  assert.equal(vehicleBlocked({ ...mid, halfLength: fleet.sedan.halfLength, halfWidth: fleet.sedan.halfWidth }), true);
  let inAlley = false;
  driveFleetLoop("moto", loop, (c, seg) => { inAlley ||= seg.roadClass === "alley" && c.speed > 5; });
  assert.ok(inAlley);
});

test("an offscreen bus clears the Obelisk entry when a second bus is left across the exit", () => {
  const node = town.roadNodeById.get("c6r5");
  const loop = buildTrafficLoop(town, node.col, node.row);
  const segments = compileFleetLoop(town, loop, "bus");
  const segIndex = segments.findIndex((seg) => seg.roundaboutEntry?.id === node.id && seg.y1 > node.y);
  const approach = segments[segIndex];
  const { halfLength, halfWidth } = fleet.bus;
  const s = approach.length - approach.roundaboutEntry.stopOffset - halfLength - 2;
  const trafficBus = {
    ...evalSegment(approach, s),
    model: "bus", halfLength, halfWidth, speed: 0, condition: 100,
    route: { class: loop.class, segments, segIndex, s, pace: 36 },
  };
  const parkedBus = {
    x: node.x + 41, y: node.y + 18, a: Math.PI,
    model: "bus", halfLength, halfWidth, speed: 0, condition: 99,
  };
  const parkedCars = cars.splice(0, cars.length, trafficBus, parkedBus);
  const savedPeople = people.splice(0);
  const { camX, camY, vw, vh, ride } = game;
  try {
    Object.assign(game, { camX: X(7) + 50, camY: Y(5), vw: 300, vh: 175, ride: trafficBus });
    let circulated = false;
    for (let frame = 0; frame < 20 * 60; frame++) {
      advanceTraffic(trafficBus, 1 / 60);
      circulated ||= segments[trafficBus.route.segIndex].roundabout?.id === node.id;
    }
    assert.ok(circulated, "the bus proceeds into the roundabout after waiting");
  } finally {
    cars.splice(0, cars.length, ...parkedCars);
    people.push(...savedPeople);
    Object.assign(game, { camX, camY, vw, vh, ride });
  }
});
