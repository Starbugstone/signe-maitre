import test from "node:test";
import assert from "node:assert/strict";
import { cars } from "../src/core/state.js";
import { footBlocked, freeSpot, move } from "../src/world/collision.js";
import { X, Y } from "../src/world/town.js";

// A clear stretch of cross street, away from the kerbs and street furniture.
const open = { x: X(2), y: Y(1) + 40 };

function withCars(list, fn) {
  const saved = cars.splice(0, cars.length);
  cars.push(...list);
  try {
    fn();
  } finally {
    cars.splice(0, cars.length, ...saved);
  }
}

test("a walker pinched between two parked cars can walk out", () => {
  // Two sedans parked nose to nose along y with a gap narrower than the walker.
  const left = { x: open.x - 7, y: open.y, a: Math.PI / 2, halfLength: 10.95, halfWidth: 4.8 };
  const right = { x: open.x + 7, y: open.y, a: Math.PI / 2, halfLength: 10.95, halfWidth: 4.8 };
  withCars([left, right], () => {
    for (const [dx, dy] of [[0, 1], [0, -1]]) {
      const walker = { x: open.x, y: open.y };
      for (let i = 0; i < 60; i++) move(walker, dx * 0.8, dy * 0.8, 2.6);
      assert.ok(Math.abs(walker.y - open.y) > 12, `walker stayed at ${walker.x},${walker.y} going ${dy}`);
    }
  });
});

test("a walker wedged in a V of crashed cars leaves by the open end", () => {
  const left = { x: open.x - 7, y: open.y, a: Math.PI / 2, halfLength: 10.95, halfWidth: 4.8 };
  const right = { x: open.x + 7, y: open.y, a: Math.PI / 2 + 0.25, halfLength: 10.95, halfWidth: 4.8 };
  withCars([left, right], () => {
    const walker = { x: open.x, y: open.y };
    for (let i = 0; i < 60; i++) move(walker, 0, -0.8, 2.6);
    assert.ok(walker.y < open.y - 12, `walker stayed at ${walker.x},${walker.y}`);
  });
});

test("a walker still cannot step into a car from clear ground", () => {
  const car = { x: open.x + 10, y: open.y, a: 0, halfLength: 10.95, halfWidth: 4.8 };
  withCars([car], () => {
    const walker = { x: open.x - 6, y: open.y };
    for (let i = 0; i < 40; i++) move(walker, 0.5, 0, 2.6);
    assert.ok(walker.x < car.x - 10.95 - 2.6 + 0.6, `walked into the bonnet at ${walker.x}`);
  });
});

test("freeSpot finds clear ground next to a car that covers the walker", () => {
  const car = { x: open.x, y: open.y, a: 0, halfLength: 10.95, halfWidth: 4.8 };
  withCars([car], () => {
    assert.ok(footBlocked(open.x, open.y, 2.6));
    const spot = freeSpot(open.x, open.y, 2.6);
    assert.ok(spot && !footBlocked(spot.x, spot.y, 2.6));
  });
});

test("the painted south pavement is walkable up to the bollard line, with no sliver at the kerb", async () => {
  const { blocked } = await import("../src/world/collision.js");
  const { town: map } = await import("../src/world/town.js");
  for (let row = 0; row < map.rows - 1; row++)
    for (const dx of [-80, 80]) {
      const x = X(2) + dx;
      // From the road across the kerb (16.8) onto the strip in front of the south blocks.
      // Bollards and lamps at the cross-street corners are real obstacles, so stay mid-block.
      for (let dy = 0; dy <= 20; dy += 0.5)
        assert.equal(blocked(x, Y(row) + dy, 2.6), false, `row ${row} dx ${dx}: wall at dy ${dy}`);
      if (row !== map.canalRow) assert.equal(blocked(x, Y(row) + 24, 2.6), true, `row ${row}: walked into the south block`);
    }
});

test("the starting sedan can drive off and steer away from the kerb", async () => {
  globalThis.document ??= { querySelector: () => ({ open: false, getContext: () => ({ setTransform() {} }) }) };
  Object.assign(globalThis, { innerWidth: 1024, innerHeight: 700, devicePixelRatio: 1 });
  globalThis.addEventListener ??= () => {};
  const { sedan } = await import("../src/world/population.js");
  const { drive } = await import("../src/game/driving.js");
  const { vehicleBlocked } = await import("../src/world/collision.js");
  assert.equal(vehicleBlocked(sedan), false, "the sedan spawns clear of the kerb posts");
  const car = { ...sedan, speed: 0, slideX: 0, slideY: 0 };
  withCars([car], () => {
    const start = { x: car.x, y: car.y };
    for (let i = 0; i < 40; i++) drive(car, 1 / 60, 1, 0, false);
    for (let i = 0; i < 40; i++) drive(car, 1 / 60, 1, 1, false);
    assert.ok(car.x - start.x > 15, `the sedan barely moved: ${car.x - start.x}`);
    assert.ok(car.y > start.y + 1, "the sedan steers out from the kerb");
  });
});
