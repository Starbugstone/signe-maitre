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
