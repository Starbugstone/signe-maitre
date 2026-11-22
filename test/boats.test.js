import assert from "node:assert/strict";
import test from "node:test";
import {
  boardableBoat, createBoatFleet, dockBoat, dockingMooring, driveBoat, hullOnWater, makeBoat,
  takeBoat, updateBoats,
} from "../src/game/boats.js";
import { town } from "../src/world/town.js";
import { carContact } from "../src/world/vehicle-shape.js";

const dt = 1 / 60;
function testRiver(solid) {
  return {
    top: 0, bottom: 180, bridges: [{ x: 600, halfWidth: 24 }], centreline: [{ x: 0, y: 90 }, { x: 1200, y: 90 }],
    moorings: [],
    onWater(x, y, r) {
      return x >= r && x <= 1200 - r && y >= r && y <= 180 - r && !solid?.(x, y, r);
    },
  };
}

test("thrust, drag and rudder differ by hull; release keeps momentum and a fast boat planes", () => {
  const water = testRiver();
  const barge = makeBoat("barge", { x: 150, y: 90, a: 0 });
  const fast = makeBoat("speedboat", { x: 150, y: 90, a: 0 });
  for (let i = 0; i < 180; i++) for (const b of [barge, fast]) driveBoat(water, b, [b], dt, 1, 0);
  assert.ok(fast.speed > barge.speed * 4);
  assert.ok(fast.plane > 0.6);
  const before = fast.speed;
  driveBoat(water, fast, [fast], dt, 0, 1);
  assert.ok(fast.speed >= before * 0.98);
  assert.ok(fast.a > 0 && fast.a < 0.02);
  assert.ok(fast.slideX > 0 && fast.slideY === 0);
});

test("a launch bounces off the quay and an island; damage comes from harder hits", () => {
  const water = testRiver((x, y, r) => x + r > 575 && x - r < 625 && y + r > 72 && y - r < 108);
  const launch = makeBoat("launch", { x: 500, y: 90, a: 0 });
  for (let i = 0; i < 150; i++) {
    driveBoat(water, launch, [launch], dt, 1, 0);
    assert.ok(hullOnWater(water, launch));
  }
  assert.ok(launch.x < 552 && launch.bumps === 1 && launch.condition < 100);
  const soft = makeBoat("launch", { x: 650, y: 24.25, a: -Math.PI / 2, slideY: -5 });
  for (let i = 0; i < 16; i++) driveBoat(water, soft, [soft], dt, 0, 0);
  assert.ok(hullOnWater(water, soft) && soft.bumps === 1 && soft.condition === 100);
});

test("boat-to-boat impacts keep hulls apart and reduce the incoming velocity", () => {
  const water = testRiver();
  const bow = makeBoat("launch", { x: 200, y: 70, a: 0, slideX: 47 });
  const moored = makeBoat("speedboat", { x: 246, y: 70, a: 0, mooring: "private" });
  for (let i = 0; i < 12; i++) {
    driveBoat(water, bow, [bow, moored], dt, 0, 0);
    assert.equal(carContact(bow, moored), null);
  }
  assert.ok(bow.condition < 100 && bow.speed < 0);
  assert.equal(moored.mooring, "private");
});

test("the nearest office mooring has the launch and can be boarded again after stepping ashore", () => {
  const water = town.river, office = town.byId.get("office");
  const { boats } = createBoatFleet(water, office);
  const home = [...water.moorings].sort((a, b) =>
    Math.hypot(a.quay.x - office.x, a.quay.y - office.y) - Math.hypot(b.quay.x - office.x, b.quay.y - office.y))[0];
  const launch = boardableBoat(boats, water, home.quay);
  assert.equal(launch.model, "launch");
  assert.equal(takeBoat(launch), false);
  assert.equal(boardableBoat(boats, water, home.quay), undefined);
  launch.slideX = 8;
  assert.equal(dockingMooring(boats, water.moorings, launch), null);
  launch.slideX = 3;
  assert.equal(dockingMooring(boats, water.moorings, launch, () => false), null);
  assert.equal(dockingMooring(boats, water.moorings, launch), home);
  assert.deepEqual(dockBoat(launch, home), { ...home.quay, a: launch.a });
  assert.equal(launch.slideX, 0);
  assert.equal(boardableBoat(boats, water, home.quay), launch);
  const empty = water.moorings.find((m) => !boats.some((b) => b.mooring === m.id));
  assert.ok(empty, "destination berth reserved for arriving boats");
  takeBoat(launch);
  Object.assign(launch, { x: empty.x, y: empty.y, a: empty.a });
  assert.ok(hullOnWater(water, launch));
  assert.equal(dockingMooring(boats, water.moorings, launch), empty);
  assert.deepEqual(dockBoat(launch, empty), { ...empty.quay, a: launch.a });
  const barge = boats.find((b) => b.model === "barge" && b.mooring);
  const besideBow = { x: barge.x + 65, y: water.top - 8 };
  assert.equal(boardableBoat(boats, water, besideBow), barge);
  assert.equal(takeBoat(barge), true);
  assert.equal(takeBoat(barge), false);
});

test("a slow traffic boat can be taken from a quay and releases its traffic reservation", () => {
  const water = testRiver();
  const boat = makeBoat("barge", { x: 500, y: 17, a: Math.PI, traffic: { sign: -1 }, slideX: -6 });
  const person = { x: 560, y: -5 };
  assert.equal(boardableBoat([boat], water, person), boat);
  assert.equal(boardableBoat([boat], water, { ...person, y: 5 }), undefined);
  assert.equal(boardableBoat([boat], water, { ...person, y: -19 }), undefined);
  boat.slideX = -9;
  assert.equal(boardableBoat([boat], water, person), undefined);
  boat.slideX = 0;
  boat.incoming = 1;
  assert.equal(boardableBoat([boat], water, person), undefined);
  delete boat.incoming;

  const gate = { left: 470, right: 530, direction: -1, inside: new Set([boat]) };
  assert.equal(takeBoat(boat), true);
  updateBoats(water, { boats: [boat], gates: [gate] }, dt, boat, 0, 0);
  assert.equal(boat.traffic, undefined);
  assert.equal(gate.direction, 0);
  assert.equal(gate.inside.size, 0);
});

test("traffic runs both ways without overlap on la Ferre and waits at a single-lane arch", () => {
  const water = testRiver((x, y, r) => x + r > 576 && x - r < 624 && (y - r < 70 || y + r > 110));
  const office = town.byId.get("office");
  for (const layout of [town.river, water]) {
    const fleet = createBoatFleet(layout, office);
    const moving = new Map(fleet.boats.filter((b) => b.traffic).map((b) => [b, 0]));
    let horns = 0;
    const gateDirections = new Set();
    if (layout === water) assert.equal(fleet.gates.length, 1);
    for (let i = 0; i < 60 * (layout === town.river ? 260 : 140); i++) {
      updateBoats(layout, fleet, dt, null, 0, 0, () => horns++);
      if (fleet.gates[0]?.direction) gateDirections.add(fleet.gates[0].direction);
      const active = fleet.boats.filter((b) => !b.incoming);
      for (const [j, boat] of active.entries()) {
        assert.ok(hullOnWater(layout, boat));
        for (const other of active.slice(j + 1)) assert.equal(carContact(boat, other), null);
        if (boat.traffic) moving.set(boat, moving.get(boat) + Math.abs(boat.slideX) * dt);
      }
    }
    assert.equal(moving.size, 4);
    assert.ok([...moving.values()].every((distance) => distance > 220), [...moving.values()].join(", "));
    assert.ok(horns > 0);
    if (layout === water) assert.deepEqual(gateDirections, new Set([-1, 1]));
  }
});
