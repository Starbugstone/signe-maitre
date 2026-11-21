import test from "node:test";
import assert from "node:assert/strict";
import { control, released } from "../src/platform/keys.js";

test("game keys work in either case and both keyboard layouts", () => {
  assert.equal(control({ key: "r" }), "report");
  assert.equal(control({ key: "Z" }), "up");
  assert.equal(control({ key: "ArrowLeft" }), "left");
  assert.equal(control({ key: " " }), "action");
  assert.equal(control({ key: "Shift", shiftKey: true }), "run");
  assert.equal(control({ key: "W", shiftKey: true }), "up");
});
test("browser shortcuts are left to the browser", () => {
  for (const modifier of ["ctrlKey", "metaKey", "altKey"])
    for (const key of ["r", "f", "w", "d", "s", "ArrowLeft"])
      assert.equal(control({ key, [modifier]: true }), undefined, modifier + "+" + key);
  assert.equal(control({ key: "Tab" }), undefined);
  assert.equal(control({}), undefined);
});
test("releasing a key clears its control whatever modifiers are held", () => {
  assert.equal(released({ key: "ArrowUp", ctrlKey: true }), "up");
  assert.equal(released({ key: "D", altKey: true }), "right");
  assert.equal(released({}), undefined);
});
