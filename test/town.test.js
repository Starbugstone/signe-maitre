import test from "node:test";
import assert from "node:assert/strict";
import { town, definition, office } from "../src/world/town.js";
import { buildTown, X, Y, sampleRingAt, ALLEY_MAX_VEHICLE_HALF_WIDTH } from "../src/world/layout.js";
import { blockedIn, vehicleBlocked } from "../src/world/collision.js";
import { buildTrafficLoop, findRoute } from "../src/world/routes.js";
import { nextPatient, seatCount } from "../src/game/triage.js";
import { planApproach } from "../src/world/ambulance-route.js";
import { viewport, outsideView } from "../src/world/viewport.js";

function reachableNodes(map, startId, { allowAlley }) {
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const u = queue.shift();
    for (const step of map.roadAdj.get(u) || []) {
      if (!allowAlley && step.edge.class === "alley") continue;
      if (seen.has(step.to)) continue;
      seen.add(step.to);
      queue.push(step.to);
    }
  }
  return seen;
}

test("city dimensions and World contract match docs/city-expansion.md", () => {
  assert.ok(town.cols >= 14 && town.rows >= 10, `map too small: ${town.cols}x${town.rows}`);
  assert.equal(town.cols, 16);
  assert.equal(town.rows, 12);

  // town.roads contract
  assert.ok(Array.isArray(town.roads.nodes) && town.roads.nodes.length > 150);
  assert.ok(Array.isArray(town.roads.edges) && town.roads.edges.length > 250);
  const kinds = new Set(town.roads.nodes.map((n) => n.kind));
  for (const k of ["cross", "tee", "end", "roundabout"]) assert.ok(kinds.has(k), `missing node kind ${k}`);
  const classes = new Set(town.roads.edges.map((e) => e.class));
  for (const c of ["avenue", "street", "alley"]) assert.ok(classes.has(c), `missing edge class ${c}`);
  for (const e of town.roads.edges) {
    assert.equal(e.halfWidth, e.class === "alley" ? 7 : 25);
  }
  assert.ok(town.roads.edges.some((e) => e.class === "alley" && e.seam), "opened seam service alleys exist");

  // town.river contract
  assert.ok(town.river.top < town.river.bottom);
  assert.ok(town.river.islands.length >= 1);
  assert.ok(town.river.bridges.length > town.cols / 2 && town.river.bridges.length < town.cols);
  for (const b of town.river.bridges) {
    assert.equal(b.x, X(b.col));
    assert.equal(b.clearance, true);
    assert.ok(b.halfWidth >= 18);
  }
  assert.ok(town.river.centreline.length >= 3);
  assert.ok(town.river.centreline[0].x <= 1 && town.river.centreline.at(-1).x >= town.width - 1);
  assert.ok(town.river.moorings.length >= 4);
  assert.equal(typeof town.river.onWater, "function");

  // town.ring contract
  assert.ok(town.ring.points.length >= 16);
  const first = town.ring.points[0],
    last = town.ring.points.at(-1);
  assert.ok(Math.hypot(first.x - last.x, first.y - last.y) < 1e-3, "ring loop must be closed");
  let sumLen = 0;
  let signedArea = 0;
  for (let i = 0; i < town.ring.points.length - 1; i++) {
    const a = town.ring.points[i],
      b = town.ring.points[i + 1];
    sumLen += Math.hypot(b.x - a.x, b.y - a.y);
    signedArea += a.x * b.y - b.x * a.y;
  }
  assert.ok(Math.abs(sumLen - town.ring.length) < 1, `ring length mismatch: ${sumLen} vs ${town.ring.length}`);
  assert.ok(signedArea > 0, "ring loop must run clockwise in screen coords");
  assert.ok(town.ring.deckLift > 20);
  assert.ok(town.ring.stations.length >= 6 && town.ring.stations.length <= 8);
  for (const st of town.ring.stations) {
    assert.ok(st.id && st.name?.fr && st.name?.en);
    const sampled = sampleRingAt(town.ring, st.s);
    assert.ok(Math.hypot(sampled.x - st.stop.x, sampled.y - st.stop.y) < 1.5, `station ${st.id} stop off ring`);
    assert.equal(blockedIn(town, st.street.x, st.street.y, 2.6), false, `station ${st.id} street blocked`);
  }

  // town.monuments contract
  assert.ok(town.monuments.length >= 6);
  const mIds = new Set(town.monuments.map((m) => m.id));
  for (const id of [
    "arc-saisies",
    "tour-fer",
    "place-contrainte",
    "hotel-ventes",
    "sacre-creancier",
    "palais-justice",
    "notre-dame-port",
  ]) {
    assert.ok(mIds.has(id), `missing monument ${id}`);
  }
  for (const m of town.monuments) {
    assert.ok(m.name?.fr && m.name?.en && Array.isArray(m.footprint) && m.footprint.length >= 4);
  }
});

test("road graph is connected: every node on foot, every bridge and roundabout on foot and by car", () => {
  const startId = `c${office.col}r${office.row}`;
  const onFoot = reachableNodes(town, startId, { allowAlley: true });
  const byCar = reachableNodes(town, startId, { allowAlley: false });

  assert.equal(onFoot.size, town.roads.nodes.length, "every road node must be reachable on foot");

  // Every roundabout reachable on foot and by car.
  for (const node of town.roads.nodes.filter((n) => n.kind === "roundabout")) {
    assert.ok(onFoot.has(node.id), `roundabout ${node.id} unreachable on foot`);
    assert.ok(byCar.has(node.id), `roundabout ${node.id} unreachable by car`);
  }

  // Every bridge reachable on both banks on foot and by car.
  for (const bridge of town.river.bridges) {
    const north = `c${bridge.col}r${town.canalRow}`,
      south = `c${bridge.col}r${town.riverSouthRow}`;
    assert.ok(onFoot.has(north) && onFoot.has(south), `bridge col ${bridge.col} unreachable on foot`);
    assert.ok(byCar.has(north) && byCar.has(south), `bridge col ${bridge.col} unreachable by car`);
  }

  // Every wide street/avenue node reachable by car.
  for (const node of town.roads.nodes) {
    const hasWide = (town.roadAdj.get(node.id) || []).some((s) => s.edge.class !== "alley");
    if (hasWide) assert.ok(byCar.has(node.id), `wide road node ${node.id} unreachable by car`);
  }

  // Every doorway reachable to street centreline.
  for (const door of town.jobs) {
    const curb = Y(town.cellAt(door.x, door.y).row);
    for (let k = 0; k <= 20; k++)
      assert.equal(blockedIn(town, door.x, door.y + ((curb - door.y) * k) / 20, 2.6), false, door.id);
  }
});

test("every road edge and bridge is physically passable, while non-bridge river water blocks land actors", () => {
  const rbNodes = town.roads.nodes.filter((n) => n.kind === "roundabout");
  const nearRoundabout = (x, y) => rbNodes.some((rb) => Math.hypot(x - rb.x, y - rb.y) < rb.outerRadius + 4);

  for (const edge of town.roads.edges) {
    const na = town.roadNodeById.get(edge.a),
      nb = town.roadNodeById.get(edge.b);
    const r = edge.class === "alley" ? 2.6 : 6;
    const steps = Math.max(4, Math.ceil(Math.hypot(nb.x - na.x, nb.y - na.y) / 8));
    for (let i = 1; i < steps; i++) {
      const f = i / steps;
      const x = na.x + (nb.x - na.x) * f,
        y = na.y + (nb.y - na.y) * f;
      if (nearRoundabout(x, y)) continue;
      assert.equal(blockedIn(town, x, y, r), false, `blocked on ${edge.class} ${edge.a}-${edge.b} at ${x},${y}`);
    }
  }

  // Non-bridge river water blocks walkers and cars, while remaining open to boats.
  const bridgeSet = new Set(town.river.bridges.map((b) => b.col));
  for (let col = 0; col < town.cols; col++) {
    if (bridgeSet.has(col)) continue;
    const x = X(col),
      y = town.river.top + 40;
    assert.equal(town.river.onWater(x, y, 8), true, `non-bridge col ${col} should be open water`);
    assert.equal(blockedIn(town, x, y, 2.6), true, `walker entered river at col ${col}`);
    assert.equal(vehicleBlocked({ x, y, a: Math.PI / 2 }), true, `car entered river at col ${col}`);
  }
});

test("river centreline, moorings and island channels are navigable for boats and accessible on foot", () => {
  // Centreline stays strictly on navigable water.
  const pts = town.river.centreline;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    for (let k = 0; k <= 10; k++) {
      const x = a.x + ((b.x - a.x) * k) / 10,
        y = a.y + ((b.y - a.y) * k) / 10;
      const margin = x < 15 || x > town.width - 15 ? 0 : 12;
      assert.equal(town.river.onWater(x, y, margin), true, `centreline leaves water at ${x},${y}`);
    }
  }

  // Both north and south channels around Île de la Ferre are navigable water.
  const isl = town.river.islands[0];
  assert.equal(town.river.onWater((isl.left + isl.right) / 2, (town.river.top + isl.top) / 2, 16), true);
  assert.equal(town.river.onWater((isl.left + isl.right) / 2, (isl.bottom + town.river.bottom) / 2, 16), true);
  assert.equal(town.river.onWater((isl.left + isl.right) / 2, (isl.top + isl.bottom) / 2, 1), false);

  // Every mooring sits on navigable water right beside a walkable quay connected to the road.
  for (const m of town.river.moorings) {
    assert.equal(town.river.onWater(m.x, m.y, 6), true, `mooring ${m.id} not on water`);
    assert.equal(blockedIn(town, m.quay.x, m.quay.y, 2.6), false, `mooring ${m.id} quay blocked`);
    assert.ok(Math.hypot(m.x - m.quay.x, m.y - m.quay.y) <= 32, `mooring ${m.id} too far from quay`);
  }
});

test("alleys admit walkers and motorbikes (halfWidth <= 3.6) and reject wide vehicles", () => {
  const alleys = town.roads.edges.filter((e) => e.class === "alley");
  assert.ok(alleys.length >= 10);
  for (const alley of alleys) {
    const na = town.roadNodeById.get(alley.a),
      nb = town.roadNodeById.get(alley.b);
    const mx = (na.x + nb.x) / 2,
      my = (na.y + nb.y) / 2;
    const angle = Math.atan2(nb.y - na.y, nb.x - na.x);
    assert.equal(blockedIn(town, mx, my, 2.6), false, `walker blocked in alley ${alley.a}-${alley.b}`);
    assert.equal(
      vehicleBlocked({ x: mx, y: my, a: angle, halfLength: 7.5, halfWidth: ALLEY_MAX_VEHICLE_HALF_WIDTH }),
      false,
      `narrow vehicle rejected from alley ${alley.a}-${alley.b}`,
    );
    assert.equal(
      vehicleBlocked({ x: mx, y: my, a: angle, halfLength: 10.95, halfWidth: 4.8 }),
      true,
      `sedan admitted into alley ${alley.a}-${alley.b}`,
    );
  }

  // Standard traffic loops never enter alley edges.
  for (let r = 0; r < town.rows; r++) {
    for (let c = 0; c < town.cols; c++) {
      const loop = buildTrafficLoop(town, c, r, { maxHalfWidth: 4.8 });
      if (!loop) continue;
      assert.equal(
        loop.segments.some((s) => s.isAlley),
        false,
        `car traffic loop at ${c},${r} entered an alley`,
      );
    }
  }
});

test("roundabouts block the island, open the ring, route around the island and circulate anticlockwise", () => {
  const roundabouts = town.roads.nodes.filter((n) => n.kind === "roundabout");
  assert.ok(roundabouts.length >= 4);
  for (const rb of roundabouts) {
    assert.equal(blockedIn(town, rb.x, rb.y, 2.6), true, `island center open at ${rb.id}`);
    assert.equal(vehicleBlocked({ x: rb.x, y: rb.y, a: 0 }), true, `car allowed on island ${rb.id}`);
    const ringR = (rb.radius + rb.outerRadius) / 2;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const rx = rb.x + Math.cos(a) * ringR,
        ry = rb.y + Math.sin(a) * ringR;
      assert.equal(blockedIn(town, rx, ry, 2.6), false, `roundabout ${rb.id} ring blocked for walker at ${k}`);
      assert.equal(
        vehicleBlocked({ x: rx, y: ry, a: a - Math.PI / 2 }),
        false,
        `roundabout ${rb.id} ring blocked for car at ${k}`,
      );
    }
  }

  // Navigation through the Obelisk roundabout (6,5) skirts the island instead of cutting through it.
  const navDrive = findRoute(town, { x: X(5), y: Y(5) }, { x: X(7), y: Y(5) }, { onFoot: false });
  const obelisk = town.roadNodeById.get("c6r5");
  for (const pt of navDrive) {
    assert.ok(Math.hypot(pt.x - obelisk.x, pt.y - obelisk.y) > obelisk.radius + 2, "driving route hit obelisk island");
  }

  // Foot navigation uses the Marais alley shortcut between (9,4) and (11,4), while car navigation routes around it.
  const footShort = findRoute(town, { x: X(9), y: Y(4) }, { x: X(11), y: Y(4) }, { onFoot: true });
  const carLong = findRoute(town, { x: X(9), y: Y(4) }, { x: X(11), y: Y(4) }, { onFoot: false });
  const pathLen = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
  assert.ok(pathLen(footShort) + 100 < pathLen(carLong), "foot route should take the Marais alley shortcut");

  // Traffic loop touching a roundabout circulates anticlockwise (deltaA < 0 in screen coords).
  const rbLoop = buildTrafficLoop(town, 5, 4, { maxHalfWidth: 4.8 });
  assert.ok(rbLoop, "expected traffic loop around block (5,4) touching Obelisk roundabout");
  const ringArcs = rbLoop.segments.filter((s) => s.roundabout);
  assert.ok(ringArcs.length >= 1, "expected roundabout ring arc in traffic loop");
  for (const arc of ringArcs) assert.ok(arc.deltaA < 0, `roundabout arc must be anticlockwise, got ${arc.deltaA}`);
});

test("Tour de Fer lets roads pass beneath while its four corner piers block actors", () => {
  const tower = town.monuments.find((m) => m.id === "tour-fer");
  assert.ok(tower?.passUnder && tower.piers?.length === 4);
  for (let d = -50; d <= 50; d += 10) {
    assert.equal(blockedIn(town, tower.x + d, tower.y, 2.6), false);
    assert.equal(blockedIn(town, tower.x, tower.y + d, 2.6), false);
    assert.equal(vehicleBlocked({ x: tower.x + d, y: tower.y, a: 0 }), false);
    assert.equal(vehicleBlocked({ x: tower.x, y: tower.y + d, a: Math.PI / 2 }), false);
  }
  for (const pier of tower.piers) {
    const cx = pier.reduce((s, p) => s + p[0], 0) / pier.length;
    const cy = pier.reduce((s, p) => s + p[1], 0) / pier.length;
    assert.equal(blockedIn(town, cx, cy, 2.6), true, "pier should block walker");
    assert.equal(vehicleBlocked({ x: cx, y: cy, a: 0 }), true, "pier should block car");
  }
});

test("the map can grow to a non-square city and viewport work stays bounded", () => {
  const blocks = Array.from({ length: 31 }, (_, row) =>
    Array.from({ length: 50 }, (_, col) =>
      town.blocks[row % town.rows][col % town.cols] === "market" ? "square" : "garage",
    ),
  );
  const map = buildTown({ blocks, canalRow: 10, addresses: [], interiors: [] });
  assert.deepEqual(map.cellAt(X(47), Y(29)), { col: 47, row: 29 });
  const area = map.visibleCells(X(46), Y(28), 400, 240, 145);
  assert.ok((area.lastCol - area.firstCol + 1) * (area.lastRow - area.firstRow + 1) < 25);
  assert.equal(blockedIn(map, X(47), Y(29), 6), false);
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
  assert.equal(nextPatient(people, scene, () => true), null);
  assert.ok(people.includes(local[1]));
});

test("ambulances enter from beyond the clamped camera on either axis and at map edges", () => {
  for (const [x, y] of [
    [X(7) + 52, Y(5) - 20],
    [X(4) + 15, Y(3) + 60],
    [18, Y(0) - 20],
    [town.width - 20, Y(11) - 20],
    [X(0) + 18, 16],
    [X(15) - 18, town.height - 15],
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
  const patient = { x: X(7) + 52, y: Y(5) - 20 };
  assert.equal(
    planApproach(patient, viewport(patient.x, patient.y, 290, 185, town.width, town.height), () => true),
    null,
  );
});

test("ambulances approach with the traffic in their lane", () => {
  for (const [x, y] of [
    [X(4) + 48, Y(1) - 22],
    [X(1) + 60, Y(3) - 22],
    [X(7) + 80, Y(5) - 20],
    [X(8) + 20, Y(3) + 60],
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
  // Market's east lamp beside the zebra crossing on row 1 (col 2 is market on the north ring leg).
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

test("an angled bumper hits the corner while the open span admits both vehicles", () => {
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

test("ring viaduct piers block walkers at pier bases while leaving street underpasses and market joins open", () => {
  assert.ok(town.ring.piers.length > 40);
  // Check both horizontal and vertical ring piers block walkers at their centres.
  const horizPier = town.ring.piers.find((p) => p.orientation === "horizontal");
  const vertPier = town.ring.piers.find((p) => p.orientation === "vertical");
  assert.ok(horizPier && vertPier);
  assert.equal(blockedIn(town, horizPier.x, horizPier.y - 1, 2.6), true);
  assert.equal(blockedIn(town, vertPier.x, vertPier.y, 2.6), true);

  // Market joins along the ring rows (row 1 and row 11) keep a walkable path beside the painted pier.
  let east = 0,
    west = 0;
  for (const row of [town.ring.northRow, town.ring.southRow]) {
    for (let col = town.ring.minCol + 1; col <= town.ring.maxCol; col++) {
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
