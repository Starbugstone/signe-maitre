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

// Stand in the middle of a block and let the street run. Traffic from neighbouring block
// loops meets at the corners; no car may stay stopped for long, on screen or off it.
for (const [col, row] of [[1, 1], [2, 2], [3, 1]]) {
  test(`traffic around block ${col},${row} never locks up over five minutes`, () => {
    game.sound = false;
    game.ride = null;
    p.x = X(col) + CELL_W / 2;
    p.y = Y(row) + CELL_H / 2;
    game.camX = p.x;
    game.camY = p.y;
    game.vw = 300;
    game.vh = 220;
    const stopped = new Map();
    let longest = 0;
    for (let frame = 0; frame < 300 * 60; frame++) {
      update(1 / 60);
      for (const c of cars) {
        if (!c.route) continue;
        const time = (c.speed || 0) < 0.5 ? (stopped.get(c) || 0) + 1 / 60 : 0;
        stopped.set(c, time);
        longest = Math.max(longest, time);
      }
    }
    assert.ok(stopped.size >= 6, `only ${stopped.size} cars were simulated`);
    assert.ok(longest < 30, `a car stayed stopped for ${longest.toFixed(1)} s`);
  });
}

test("traffic keeps moving round a player standing in the middle of a junction", () => {
  game.ride = null;
  const { roadsX, roadsY } = town;
  Object.assign(p, { x: roadsX[1], y: roadsY[1], stuck: 0 });
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
test("a player in a wider pocket between two wrecks and the kerb is lifted out", () => {
  game.ride = null;
  Object.assign(p, { x: 519.17, y: 313.56, stuck: 0 });
  update(0);
  cars.length = people.length = 0;
  cars.push({ x: 506.87, y: 308.14, a: -0.15, condition: 0 }, { x: 533.01, y: 308.22, a: 0.15, condition: 0 });
  for (const dir of ["up", "left", "right", "down"]) {
    held.add(dir, "test");
    try {
      for (let i = 0; i < 90; i++) update(1 / 60);
    } finally {
      held.clear();
    }
  }
  assert.ok(Math.hypot(p.x - 519.17, p.y - 313.56) > 12, `still in the pocket at ${p.x},${p.y}`);
});
test("a player boxed into a clear pocket between two wrecks and the kerb is lifted out", () => {
  game.ride = null;
  game.time = 0;
  Object.assign(p, { x: 520, y: 313.8, stuck: 0 });
  game.camX = p.x;
  game.camY = p.y;
  update(0);
  cars.length = people.length = 0;
  cars.push({ x: 508.45, y: 308, a: -0.15, condition: 0 }, { x: 531.55, y: 308, a: 0.15, condition: 0 });
  held.add("up", "test");
  try {
    for (let i = 0; i < 120; i++) update(1 / 60);
  } finally {
    held.clear();
  }
  assert.ok(Math.hypot(p.x - 520, p.y - 313.8) > 2, `still pinned at ${p.x},${p.y}`);
});
