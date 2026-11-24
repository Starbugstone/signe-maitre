// These tests exercise the same street simulation as play, with no page: no renderer, no audio.
import test from "node:test";
import assert from "node:assert/strict";
const { game, p, cars, people } = await import("../src/core/state.js");
const rescue = await import("../src/game/rescue.js");
const { person } = await import("../src/world/population.js");
const { slap, landSlap } = await import("../src/game/slap.js");
const { board, exitCar } = await import("../src/game/boarding.js");
const { drive, carContact } = await import("../src/game/driving.js");
const { viewport, outsideView } = await import("../src/world/viewport.js");
const { W, H } = await import("../src/world/town.js");
// The view a 1024 × 700 window gives (src/platform/canvas.js): what counts as on screen.
game.vw = 280;
game.vh = (700 * 280) / 1024;
game.sound = false;

function rescueTick() {
  game.time += 1 / 60;
  rescue.updateAmbulance(1 / 60);
}
function patient(x, y) {
  const n = person(x, y);
  rescue.knockDown(n, "slaps");
  n.downSince = game.time - 13;
  return n;
}
function parkPlayer(x, y) {
  Object.assign(p, { x, y });
  game.camX = x;
  game.camY = y;
}
test("dispatch enters under power, loads four, sends a second van and survives a hijacking", () => {
  parkPlayer(739, 279);
  cars.length = 0;
  people.length = 0;
  const patients = [-9, -4, 2, 8, 17].map((dx) => patient(p.x + dx, p.y));
  const vans = [];
  for (let i = 0; i < 60 * 70; i++) {
    rescueTick();
    const v = rescue.ambulance;
    if (v && !vans.includes(v)) {
      assert.ok(outsideView(v, viewport(game.camX, game.camY, game.vw, game.vh, W, H)));
      vans.push(v);
    }
    if (vans.length === 2 && v.state === "collecting") break;
  }
  assert.equal(vans.length, 2);
  assert.equal(vans[0].loaded, 4);
  assert.equal(patients.filter((n) => people.includes(n)).length, 1);
  const second = vans[1];
  assert.equal(second.state, "collecting");
  const at = rescue.medicalCrew(second);
  parkPlayer(at.x, at.y);
  slap();
  landSlap();
  assert.equal(second.state, "parked");
  assert.equal(people.find((n) => n.kind === "medic").hits, 1);
  const remaining = patients.find((n) => people.includes(n));
  assert.equal(!!remaining.onStretcher, false);
  parkPlayer(second.x, second.y + 5);
  board();
  assert.equal(game.ride, second);
  const start = { x: second.x, y: second.y };
  for (let i = 0; i < 20; i++) drive(second, 1 / 60, 1, 0, false);
  assert.ok(Math.hypot(second.x - start.x, second.y - start.y) > 1);
  exitCar();
  assert.equal(game.ride, null);
  assert.ok(cars.includes(second));
});
test("moving ambulance and oncoming sedan both take closing-speed damage without overlapping", () => {
  const van = {
    x: 700,
    y: 306,
    a: 0,
    speed: 90,
    slideX: 90,
    slideY: 0,
    condition: 100,
    medical: true,
    halfLength: 13.3,
    halfWidth: 5.45,
  };
  const sedan = { x: 724, y: 306, a: Math.PI, speed: 40, slideX: -40, slideY: 0, condition: 100 };
  cars.splice(0, cars.length, van, sedan);
  for (let i = 0; i < 3; i++) drive(van, 1 / 60, 0, 0, false);
  assert.ok(van.condition < 70 && van.condition > 30 && van.condition === sedan.condition);
  assert.ok((carContact(van, sedan)?.depth ?? 0) < 0.1);
});
test("a car crossing an arriving ambulance creates an impact before the van is stolen", () => {
  cars.length = 0;
  people.length = 0;
  parkPlayer(735, 279);
  patient(744, 279);
  rescueTick();
  const van = rescue.ambulance;
  assert.ok(van);
  let i = 0;
  while (van.speed < 40 && ++i < 90) rescueTick();
  const car = {
    x: van.x + 23 * van.dx,
    y: van.y + 23 * van.dy,
    a: van.a + Math.PI,
    speed: 25,
    slideX: -25 * van.dx,
    slideY: -25 * van.dy,
    condition: 100,
  };
  cars.push(car);
  rescueTick();
  assert.ok(van.condition < 100 && car.condition < 100);
  assert.equal(van.speed, 0);
});
function settle() {
  // Let earlier vans finish and drive out of sight before a scene is staged.
  people.length = 0;
  parkPlayer(100, 100);
  for (let i = 0; i < 60 * 90 && (rescue.ambulance || cars.some((c) => rescue.inService(c))); i++)
    rescueTick();
  assert.equal(rescue.ambulance, null);
  cars.length = 0;
}
test("a van boxed in short of the scene backs out and another approach reaches the patient", () => {
  settle();
  parkPlayer(1295, 278);
  const waiting = patient(p.x + 6, p.y);
  rescueTick();
  const van = rescue.ambulance;
  assert.ok(van);
  // A stalled car straddles the lane well before the van is close enough to park early.
  const wreck = {
    x: van.x + 40 * van.dx,
    y: van.y + 40 * van.dy,
    a: van.a,
    speed: 0,
    slideX: 0,
    slideY: 0,
    condition: 100,
  };
  cars.push(wreck);
  const gap = (v) => Math.hypot(v.x - wreck.x, v.y - wreck.y);
  for (let i = 0; i < 60 * 2; i++) rescueTick();
  assert.equal(rescue.ambulance, van, "a short hold-up is not a reason to leave");
  const boxed = gap(van);
  assert.ok(Math.hypot(van.x - waiting.x, van.y - waiting.y) > 80);
  let replacement = null;
  for (let i = 0; i < 60 * 4 && !replacement; i++) {
    rescueTick();
    if (rescue.ambulance && rescue.ambulance !== van) replacement = rescue.ambulance;
  }
  assert.ok(replacement, "dispatch stays jammed behind the first van");
  assert.equal(van.state, "leaving");
  assert.equal(carContact(replacement, wreck), null);
  for (let i = 0; i < 45; i++) rescueTick();
  assert.ok(!cars.includes(van) || gap(van) > boxed + 4, "the first van reverses clear");
  for (let i = 0; i < 60 * 60 && people.includes(waiting); i++) rescueTick();
  assert.ok(!people.includes(waiting));
  assert.equal(replacement.loaded, 1);
  assert.ok(!cars.includes(van));
});
