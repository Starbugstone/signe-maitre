import test from "node:test";
import assert from "node:assert/strict";
import { town, definition } from "../src/world/town.js";
import { buildTown, X, Y, trainPosition } from "../src/world/layout.js";
import { blockedIn } from "../src/world/collision.js";
import { nextPatient, seatCount } from "../src/game/triage.js";

function checkCrossings(map) {
  for (const x of map.roadsX)
    for (let y = 6; y <= map.height - 6; y += 4)
      assert.equal(blockedIn(map, x, y, 6), false, `bridge/road cut at ${x},${y}`);
  for (const y of map.roadsY)
    for (let x = 6; x <= map.width - 6; x += 4)
      assert.equal(blockedIn(map, x, y, 6), false, `street cut at ${x},${y}`);
  for (const door of map.jobs) {
    const curb = Y(map.cellAt(door.x, door.y).row);
    for (let k = 0; k <= 20; k++)
      assert.equal(blockedIn(map, door.x, door.y + ((curb - door.y) * k) / 20, 2.6), false, door.id);
  }
}
test("all streets, bridges and doorways are connected", () => checkCrossings(town));
test("the map can grow to a non-square city and viewport work stays bounded", () => {
  const blocks = Array.from({ length: 31 }, (_, row) =>
    Array.from({ length: 50 }, (_, col) =>
      town.blocks[row % town.rows][col % town.cols] === "market" ? "square" : "garage",
    ),
  );
  const map = buildTown({ ...definition, blocks });
  checkCrossings(map);
  assert.deepEqual(map.cellAt(X(47), Y(29)), { col: 47, row: 29 });
  const area = map.visibleCells(X(46), Y(28), 400, 240, 145);
  assert.ok((area.lastCol - area.firstCol + 1) * (area.lastRow - area.firstRow + 1) < 25);
});
test("viaducts stay connected through every seam; trains wrap beyond the visible ends", () => {
  assert.throws(() => buildTown({ ...definition, railways: [] }), /unconnected/);
  assert.throws(
    () => buildTown({ ...definition, railways: [{ ...definition.railways[0], to: "cinema" }] }),
    /boundaries/,
  );
  for (const line of town.lines.values()) {
    for (let col = 1; col < town.cols; col++) {
      const seam = (X(col) + X(col - 1)) / 2;
      const at = (seam - line.phase + (town.width + 3 * 51.6 + 36)) / line.speed;
      const a = trainPosition(line, town.width, at - 0.01),
        b = trainPosition(line, town.width, at + 0.01);
      assert.ok(a.head < seam && b.head > seam);
    }
  }
});
test("interiors resolve both sides of a door and reject unreachable anchors", () => {
  assert.ok(town.byId.has(town.rooms.get("office").door));
  const room = town.rooms.get("office");
  assert.throws(() => buildTown({ ...definition, interiors: [{ ...room, door: "missing" }] }), /door/);
  assert.throws(
    () => buildTown({ ...definition, interiors: [{ ...room, exit: { x: 20, y: -1 } }] }),
    /anchor/,
  );
});
test("one parked van can select four reachable local patients", () => {
  const scene = { origin: { x: 0, y: 0 }, apron: { x: 0, y: 0 }, loaded: 0 };
  const local = [1, 2, 4, 8, 9].map((x) => ({ x, y: 0, knockedOut: true }));
  const people = [{ x: 85, y: 0, knockedOut: true }, { x: 0, y: 2 }, ...local];
  while (scene.loaded < seatCount) {
    const n = nextPatient(people, scene, (n) => n.x !== 2);
    assert.ok(n);
    people.splice(people.indexOf(n), 1);
    scene.loaded++;
  }
  assert.equal(
    nextPatient(people, scene, () => true),
    null,
  );
  assert.ok(people.includes(local[1]));
});

import { planApproach } from "../src/world/ambulance-route.js";
import { viewport, outsideView } from "../src/world/viewport.js";
test("ambulances enter from beyond the clamped camera on either axis and at map edges", () => {
  for (const [x, y] of [
    [800, Y(1) - 20],
    [X(3) + 15, 630],
    [18, Y(0) - 20],
    [town.width - 20, Y(5) - 20],
    [X(0) + 18, 16],
    [X(5) - 18, town.height - 15],
  ]) {
    for (const [w, h] of [
      [295, 185],
      [450, 150],
      [155, 330],
    ]) {
      const view = viewport(x, y, w, h, town.width, town.height);
      const route = planApproach({ x, y }, view, () => false);
      assert.ok(route, `no route at ${x},${y}`);
      assert.ok(outsideView(route.spawn, view, 36));
      assert.ok((route.stop.x - route.spawn.x) * route.dx + (route.stop.y - route.spawn.y) * route.dy > 0);
    }
  }
});
test("an obstructed dispatch waits instead of appearing on camera", () => {
  const patient = { x: 800, y: Y(1) - 20 };
  assert.equal(
    planApproach(patient, viewport(800, 300, 290, 185, town.width, town.height), () => true),
    null,
  );
});
test("ambulances approach with the traffic in their lane", () => {
  // Block circuits run clockwise: north and east lanes carry westbound and northbound cars.
  for (const [x, y] of [
    [X(4) + 60, Y(1) - 22],
    [X(1) + 60, Y(3) - 22],
    [X(3) + 80, Y(4) - 20],
    [X(3) + 20, Y(3) + 60],
    [X(1) + 20, Y(0) + 70],
  ]) {
    const { col, row } = town.cellAt(x, y);
    const route = planApproach({ x, y }, viewport(x, y, 290, 185, town.width, town.height), () => false);
    assert.ok(route, `no route at ${x},${y}`);
    const lane = route.stop.horizontal ? route.stop.y - Y(row) : X(col) - route.stop.x;
    assert.notEqual(lane, 0);
    assert.equal(route.dx + route.dy, Math.sign(lane), `against the flow at ${x},${y}`);
  }
});

test("feet stop at the registered lamp base and can pass on both sides", async () => {
  const { move } = await import("../src/world/collision.js");
  // Market's east lamp beside the zebra crossing.
  const x = X(2) + 39,
    y = Y(1) - 20;
  for (const r of [2.6, 3]) {
    const walker = { x, y: y + 9 };
    for (let i = 0; i < 24; i++) move(walker, 0, -0.5, r);
    assert.ok(walker.y > y + 2 && walker.y < y + 6);
    for (const side of [-1, 1]) {
      const beside = { x: x + side * 6, y: y + 7 };
      for (let i = 0; i < 24; i++) move(beside, 0, -0.5, r);
      assert.equal(beside.y, y - 5);
    }
  }
});

test("an angled bumper hits the corner while the open span admits both vehicles", async () => {
  const { vehicleBlocked } = await import("../src/world/collision.js");
  for (const col of [1, 2]) {
    const corner = { x: X(col) - 23, y: Y(1) - 23, a: -Math.PI * 0.65 };
    assert.ok(vehicleBlocked(corner));
    assert.ok(!vehicleBlocked({ ...corner, x: X(col) - 12, y: Y(1) - 15 }));
    for (const halfLength of [10.95, 13.3])
      for (const a of [-Math.PI / 2, Math.PI / 2])
        for (let y = -88; y < 8; y++)
          assert.ok(!vehicleBlocked({ x: X(col) + 6, y: Y(1) + y, a, halfLength, halfWidth: 5.45 }));
  }
});

test("a walker cannot pass through a parked vehicle from the side or end", async () => {
  const { cars } = await import("../src/core/state.js");
  const { move } = await import("../src/world/collision.js");
  const car = { x: X(1), y: Y(1), a: Math.PI / 4 };
  cars.push(car);
  try {
    for (const angle of [car.a, car.a + Math.PI / 2]) {
      const dx = Math.cos(angle),
        dy = Math.sin(angle);
      const walker = { x: car.x + dx * 18, y: car.y + dy * 18 };
      for (let i = 0; i < 32; i++) move(walker, -dx * 0.6, -dy * 0.6, 2.6);
      assert.ok(Math.hypot(walker.x - car.x, walker.y - car.y) >= (angle === car.a ? 13 : 7));
    }
  } finally {
    cars.splice(cars.indexOf(car), 1);
  }
});

test("a railway column blocks both approaches along an otherwise walkable alley", () => {
  const seam = (X(0) + X(1)) / 2;
  for (const radius of [2.6, 3]) {
    assert.equal(blockedIn(town, seam, Y(1) - 40, radius), false);
    assert.equal(blockedIn(town, seam, Y(1) - 30, radius), true);
    assert.equal(blockedIn(town, seam, Y(1) - 21, radius), false);
    assert.equal(blockedIn(town, seam, Y(0) - 30, radius), false);
  }
});

test("both market joins use the painted pier and leave a walkable path through the alley", () => {
  let east = 0,
    west = 0;
  for (const row of town.lines.keys()) {
    for (let col = 1; col < town.cols; col++) {
      const left = town.blocks[row][col - 1] === "market",
        right = town.blocks[row][col] === "market";
      if (left === right) continue;
      if (left) west++;
      else east++;
      const seam = (X(col - 1) + X(col)) / 2;
      const marketPier = seam + (left ? -6 : 16.8);
      for (const r of [2.6, 3]) {
        assert.equal(blockedIn(town, seam, Y(row) - 30, r), left);
        assert.equal(blockedIn(town, seam + (left ? 2.6 : -2.6), Y(row) - 30, r), false);
        assert.equal(blockedIn(town, marketPier, Y(row) - 30, r), true);
      }
    }
  }
  assert.ok(east && west);
});
