import test from "node:test";
import assert from "node:assert/strict";
import { analog, held, steeringInput, throttleInput, walkVector } from "../src/core/controls.js";
import { readGamepad } from "../src/platform/gamepad.js";

const read = (axes, values = {}) => readGamepad({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: values[i] === 1, value: values[i] ?? 0 })),
});

test("stick drift stays neutral and diagonal travel keeps the full stick direction and speed", () => {
  const centered = read([0.1, -0.1], { 6: 0.05 });
  assert.equal(centered.stickActive, false);
  assert.equal(Math.hypot(centered.x, centered.y), 0);
  assert.equal(centered.throttle, 0);

  const partial = read([0.4, -0.3]);
  assert.ok(Math.hypot(partial.x, partial.y) > 0 && Math.hypot(partial.x, partial.y) < 1);
  assert.ok(partial.steering > 0 && partial.steering < 1);

  const full = read([-1, 1]);
  assert.ok(Math.abs(Math.hypot(full.x, full.y) - 1) < 1e-10);
  assert.equal(full.x, -full.y);
  assert.equal(full.steering, -1);
});

test("standard Xbox buttons give action edges and triggers retain their analog values", () => {
  const pad = read([0, 0, 0, -1], { 0: 1, 2: 1, 3: 1, 5: 1, 7: 0.5, 11: 1, 14: 1 });
  assert.deepEqual([...pad.controls], ["job", "action", "car", "horn", "report", "left"]);
  assert.ok(pad.throttle > 0 && pad.throttle < 1);
  assert.equal(pad.menuStep, -1);
  assert.equal(pad.menuScroll, -1);
  assert.equal(read([0, 0], { 6: 1 }).throttle, -1);
  assert.equal(read([0, 0], { 7: 1 }).throttle, 1);
});

test("releasing one device leaves the other device's hold intact", () => {
  const controller = Symbol("controller");
  Object.assign(analog, { x: -0.25, y: 0.4, steering: -0.25, throttle: 0.5 });
  held.add("right", controller);
  held.add("right", "ArrowRight");
  held.delete("right", controller);
  assert.deepEqual(walkVector(), [1, 0.4]);
  assert.equal(steeringInput(), 1);
  held.delete("right", "ArrowRight");
  assert.deepEqual(walkVector(), [-0.25, 0.4]);
  assert.equal(steeringInput(), -0.25);
  held.add("up", controller);
  assert.equal(throttleInput(), 1);
  held.clear();
  assert.deepEqual(walkVector(), [0, 0]);
  assert.equal(throttleInput(), 0);
});
