import test from "node:test";
import assert from "node:assert/strict";

// The street simulation imports the canvas and audio modules; give them inert stand-ins.
const elements = new Map();
globalThis.document ??= {
  querySelector(key) {
    if (!elements.has(key)) elements.set(key, { open: false, getContext: () => ({ setTransform() {} }) });
    return elements.get(key);
  },
};
Object.assign(globalThis, { innerWidth: 1024, innerHeight: 700, devicePixelRatio: 1 });
globalThis.addEventListener ??= () => {};

const { game, p, cars, people, held } = await import("../src/core/state.js");
const { update } = await import("../src/game/simulation.js");
const { X, Y, CELL_W, CELL_H, town } = await import("../src/world/town.js");

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
