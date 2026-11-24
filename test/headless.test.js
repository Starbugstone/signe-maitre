import test from "node:test";
import assert from "node:assert/strict";

// No document, canvas or audio stand-ins: the simulation must run without a page.
const { game, p, cars, people, held } = await import("../src/core/state.js");
const { on } = await import("../src/core/events.js");
const { update } = await import("../src/game/simulation.js");
const { board } = await import("../src/game/boarding.js");
const { sedan } = await import("../src/world/population.js");

test("the street runs headless and reports what happens as events", () => {
  assert.equal(typeof globalThis.document, "undefined");
  const heard = { message: 0, sound: 0 };
  on("message", () => heard.message++);
  on("sound", () => heard.sound++);
  game.vw = 360;
  game.vh = 240;
  const start = { x: p.x, y: p.y };
  held.add("run", "test");
  held.add("right", "test");
  for (let frame = 0; frame < 120; frame++) update(1 / 60);
  held.clear();
  assert.ok(Math.hypot(p.x - start.x, p.y - start.y) > 30, "the bailiff did not walk");
  assert.ok(heard.sound > 0, "no footsteps were cued");
  assert.ok(cars.length > 4 && people.length > 4, "the street was not populated");
  Object.assign(p, { x: sedan.x, y: sedan.y + 9 });
  board();
  assert.equal(game.ride, sedan, "the bailiff did not get into the sedan");
  assert.ok(heard.message > 0, "boarding said nothing on the ticker");
});
