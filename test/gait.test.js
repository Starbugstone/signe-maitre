import test from "node:test";
import assert from "node:assert/strict";
import { advanceGait, advanceStroll, createGait, createStroll, facingRow, rows, strides } from "../src/art/gait.js";

const frame = 1 / 60;
// Walk a gait tracker for `seconds` at `pace` world units a second.
function travel(gait, { seconds, pace, heading = 0, running = false, from = { now: 0, distance: 0 } }) {
  let { now, distance } = from;
  for (let t = 0; t < seconds - 1e-9; t += frame) {
    now += frame;
    distance += pace * frame;
    advanceGait(gait, { distance, moving: pace > 0, running, heading, now });
  }
  return { now, distance };
}

test("a diagonal keeps the facing already shown", () => {
  const diagonal = -Math.PI / 4;
  assert.equal(facingRow(diagonal, rows.right), rows.right);
  assert.equal(facingRow(diagonal, rows.up), rows.up);
  assert.equal(facingRow(diagonal, rows.down), rows.up);
  assert.equal(facingRow(Math.PI * 0.75, rows.right), rows.left);
  assert.equal(facingRow(Math.PI / 2, rows.left), rows.down);
});

test("one stride cycle covers two footfalls at each gait's own length", () => {
  for (const [key, pace] of [
    ["walk", 24],
    ["run", 48],
  ]) {
    const gait = createGait();
    const start = travel(gait, { seconds: frame, pace, running: key === "run" });
    const turn = gait.turn;
    travel(gait, { seconds: strides[key] / pace, pace, running: key === "run", from: start });
    assert.ok(Math.abs(((gait.turn - turn + 1) % 1) - 0.5) < 0.02, key + " advances half a cycle per stride");
  }
  assert.equal(strides.run, 2 * strides.walk, "the run covers twice the ground at the same cadence");
});

test("setting off always starts on the same lifted foot and faces the heading at once", () => {
  const gait = createGait();
  let at = travel(gait, { seconds: 0.4, pace: 24, heading: 0 });
  at = travel(gait, { seconds: 0.5, pace: 0, from: at });
  assert.equal(gait.moving, false);
  assert.equal(gait.settle, 0, "the settle has played out");
  advanceGait(gait, { distance: at.distance + 0.4, moving: true, running: false, heading: -Math.PI / 2, now: at.now + frame });
  assert.equal(gait.row, rows.up);
  assert.ok(gait.turn > 0.13 && gait.turn < 0.2, "the first frame is the lifted foot, not a full stride");
});

test("letting go of a diagonal one key at a time does not flick the facing", () => {
  const gait = createGait();
  let at = travel(gait, { seconds: 0.3, pace: 24, heading: Math.PI });
  at = travel(gait, { seconds: 0.3, pace: 24, heading: -Math.PI * 0.75, from: at });
  assert.equal(gait.row, rows.left, "up-left keeps the profile");
  at = travel(gait, { seconds: 0.04, pace: 24, heading: -Math.PI / 2, from: at });
  assert.equal(gait.row, rows.left, "the last key held for a moment does not turn him");
  at = travel(gait, { seconds: 0.3, pace: 0, heading: -Math.PI / 2, from: at });
  assert.equal(gait.row, rows.left);
  const turning = createGait();
  at = travel(turning, { seconds: 0.3, pace: 24, heading: Math.PI });
  travel(turning, { seconds: 0.12, pace: 24, heading: -Math.PI / 2, from: at });
  assert.equal(turning.row, rows.up, "a held turn goes through");
  const reversing = createGait();
  at = travel(reversing, { seconds: 0.3, pace: 24, heading: Math.PI });
  travel(reversing, { seconds: frame, pace: 24, heading: 0, from: at });
  assert.equal(reversing.row, rows.right, "an about-turn is immediate");
});

test("a passer-by's legs follow the ground actually covered and stop with the body", () => {
  const stroll = createStroll();
  let now = 0,
    x = 0;
  const step = (pace, seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += frame) {
      now += frame;
      x += pace * frame;
      advanceStroll(stroll, { x, y: 0, heading: 0, now, stride: 6 });
    }
  };
  step(15, 0.1);
  const turn = stroll.turn,
    from = x;
  step(15, 0.8);
  assert.ok(stroll.walking);
  assert.ok(Math.abs(((stroll.turn - turn + 8) % 1) - (((x - from) / 12) % 1)) < 0.02, "one cycle every two strides");
  const held = stroll.turn;
  step(0, 0.05);
  assert.ok(stroll.walking, "a jostle is not a stop");
  step(0, 0.3);
  assert.equal(stroll.walking, false);
  assert.equal(stroll.turn, held, "legs do not cycle on the spot");
  step(46, 0.6);
  assert.ok(stroll.hurry > 0.9, "fleeing lengthens the stride");
});
