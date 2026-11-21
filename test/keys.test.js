import test from "node:test";
import assert from "node:assert/strict";
import { control, released, trackKonami } from "../src/platform/keys.js";

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

const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
const track = (keys) => keys.reduce((matched, key) => trackKonami(typeof key === "string" ? { key } : key, matched), 0);

test("the Konami code accepts a fresh or overlapping start and ignores repeats and shortcuts", () => {
  assert.equal(track(konami), -1);
  assert.equal(track(["ArrowUp", ...konami]), -1);
  assert.equal(track([...konami.slice(0, -2), { key: "ArrowRight", repeat: true }, { key: "r", ctrlKey: true }, "B", "A"]), -1);
});

test("ordinary movement and interrupted Konami sequences do not activate the hero", () => {
  assert.equal(track(konami.slice(0, -1)), 9);
  assert.equal(track([...konami.slice(0, -1), { key: "a", metaKey: true }]), 9);
  assert.equal(track([...konami.slice(0, -1), "x", "a"]), 0);
  assert.equal(control({ key: "a" }), "left");
});
