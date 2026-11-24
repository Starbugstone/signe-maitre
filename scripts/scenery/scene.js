// This entry point adds scenery fixtures to the normal game only in the test bundle.
import "../../src/main.js";
import { cars, done, fx, game, p, people, trails } from "../../src/core/state.js";
import { dude } from "../../src/art/pedestrians.js";
import { boatFleet, hullOnWater, makeBoat, river } from "../../src/game/boats.js";
import { drawCar } from "../../src/art/vehicles.js";
import { canvas, g } from "../../src/platform/canvas.js";
import { blocked, move, vehicleBlocked } from "../../src/world/collision.js";
import { town, X, Y } from "../../src/world/town.js";
import { fromRiver, paintings, riverMarks } from "../../src/world/paintings.js";
import { repaintStreets, streetCache, streetLayer } from "../../src/world/streets.js";
import { streetProps } from "../../src/world/street-props.js";
import { viewport } from "../../src/world/viewport.js";
import { draw } from "../../src/ui/renderer.js";
import { cornerSupportAt, cornerSupports } from "../../src/world/viaduct.js";
import { ringLine } from "../../src/game/transit.js";
import { trainsetAt } from "../../src/game/ring-route.js";

// Walking frames are timed by the clock. Hold it still, so that two renders of one pose match.
const stillClock = performance.now();
performance.now = () => stillClock;

function requireCheck(ok, message) {
  if (!ok) throw new Error(message);
}

function camera(x, y) {
  game.camX = x;
  game.camY = y;
  return viewport(x, y, game.vw, game.vh, town.width, town.height);
}

function pixels(view, x, y, w, h) {
  const sx = canvas.width / game.vw,
    sy = canvas.height / game.vh;
  return g.getImageData(
    Math.round((x - view.left) * sx),
    Math.round((y - view.top) * sy),
    Math.round(w * sx),
    Math.round(h * sy),
  ).data;
}

function difference(a, b) {
  let count = 0;
  for (let i = 0; i < a.length; i += 4)
    if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 12)
      count++;
  return count;
}

function actorLayers(x, y, behind) {
  const view = camera(x, y);
  const npc = { x, y, a: 0, gait: 1.6, look: "worker", kind: "local" };
  for (const actor of [p, npc])
    for (let facing = 0; facing < 4; facing++)
      for (const moving of [false, true]) {
        Object.assign(actor, { x, y, a: (facing * Math.PI) / 2, moving });
        if (actor === npc) people.push(npc);
        draw();
        const sample = () => pixels(view, x - 3, y - 13, 6, 9);
        const actual = sample();
        actor.x = -100;
        draw();
        const empty = sample();
        actor.x = x;
        g.save();
        g.translate(-view.left, -view.top);
        dude(actor, actor === p);
        g.restore();
        const reference = sample();
        const body = difference(reference, empty),
          covered = difference(actual, reference);
        draw();
        requireCheck(body > 100, "Pose missing from sample");
        requireCheck(
          behind ? covered > 40 && difference(actual, empty) > 25 : covered < 12,
          (actor === p ? "Player" : "Pedestrian") +
            " facing " +
            facing +
            " moving=" +
            moving +
            " covered pixels=" +
            covered,
        );
        actor.x = -100;
        people.length = 0;
      }
}

function gateVehicle() {
  const x = X(1) + 87,
    y = Y(1) - 17,
    view = camera(x, y);
  const v = { x, y, a: 0, tint: "olive", speed: 0, slideX: 0, slideY: 0 };
  game.ride = v;
  for (const condition of [100, 30, 0])
    for (let heading = 0; heading < 8; heading++) {
      Object.assign(v, { condition, a: (heading * Math.PI) / 4 });
      cars.push(v);
      draw();
      const sample = () => pixels(view, x - 4, y - 11, 8, 8);
      const actual = sample();
      cars.length = 0;
      draw();
      g.save();
      g.translate(-view.left, -view.top);
      drawCar(v);
      g.restore();
      const covered = difference(actual, sample());
      cars.push(v);
      draw();
      requireCheck(covered < 12, "Gate covers car at heading " + heading + " condition " + condition);
      cars.length = 0;
    }
  game.ride = null;
}

// Two paintings meet wall against wall. Nobody steps off the pavement into the join, under
// the ring's deck or anywhere else, and a walker at the join stands in front of both blocks.
function checkJoins() {
  let joins = 0;
  for (let row = 0; row < town.rows; row++) {
    // North of Quai Sud lies the quay itself, open ground down to the water.
    if (row === town.riverRow || row === town.riverSouthRow) continue;
    for (let col = 1; col < town.cols; col++) {
      const join = (X(col - 1) + X(col)) / 2,
        y = Y(row);
      if (town.cellMeta(col, row).roundabouts.some((rb) => Math.abs(rb.x - join) < rb.outerRadius + 4)) continue;
      // A lamp post or a pier of the ring may stand on the join itself: step round it.
      const x = [0, -6, 6, -11, 11].map((dx) => join + dx).find((x) => !blocked(x, y - 24, 2.6));
      if (x == null) continue;
      const walker = { x, y: y - 24 };
      for (let i = 0; i < 96; i++) move(walker, 0, -0.25, 2.6);
      requireCheck(walker.y > y - 31, "Walked into the join of two paintings at " + col + "," + row);
      joins++;
    }
  }
  requireCheck(joins > 125, "Too few joins were exercised: " + joins);
  // On the pavement at a join, in front of the houses on both sides: a ring row, a boulevard
  // and the old quarter.
  for (const [col, row] of [
    [5, town.ring.northRow],
    [4, 2],
    [11, 4],
  ])
    actorLayers((X(col - 1) + X(col)) / 2, Y(row) - (row === 4 ? 0 : 25), false);
}

// Behind every block runs the paved passage its south-facing houses open on. A walker turns
// into it from the pavement of one cross street and comes out on the next; no car follows.
function checkBackPassage() {
  let passages = 0;
  for (const [col, row] of [
    [2, 2],
    [5, 3],
    [8, 4],
    [10, 3],
    [12, 9],
    [13, 5],
    [6, 10],
  ]) {
    requireCheck(town.backLane(row), "No passage behind row " + row);
    const y = Y(row) + 114 - 3.5,
      from = X(col) + 20,
      to = X(col + 1) - 20;
    const walker = { x: from, y };
    requireCheck(!blocked(from, y, 2.6), "Passage mouth blocked at " + col + "," + row);
    for (let i = 0; i < 1400 && walker.x < to; i++) move(walker, 0.25, 0, 2.6);
    requireCheck(walker.x >= to, `Passage behind ${col},${row} stops a walker at ${walker.x.toFixed(1)}`);
    requireCheck(Math.abs(walker.y - y) < 2.5, "Walker left the passage behind " + col + "," + row);
    // Neither the roofs south of it nor the houses north of it are ground.
    const mid = (from + to) / 2;
    requireCheck(blocked(mid, y + 8, 2.6) && blocked(mid, y - 9, 2.6), "Passage wider than painted behind " + col + "," + row);
    requireCheck(
      vehicleBlocked({ x: mid, y, a: 0, halfLength: 7.5, halfWidth: 3 }),
      "Motorbike admitted into the passage behind " + col + "," + row,
    );
    passages++;
  }
  requireCheck(passages === 7, "Too few passages were exercised");
  // In the passage a walker stands in front of the houses behind them.
  actorLayers((X(5) + X(6)) / 2 + 30, Y(3) + 114 - 3.5, false);
  actorLayers((X(10) + X(11)) / 2 - 30, Y(3) + 114 - 3.5, false);
}

function checkRoundaboutIsland() {
  const rb = town.roadNodeById.get("c6r5"); // Place de la Contrainte obelisk roundabout
  requireCheck(blocked(rb.x, rb.y, 2.6), "Obelisk island centre should block walker");
  requireCheck(vehicleBlocked({ x: rb.x, y: rb.y, a: 0 }), "Obelisk island centre should block vehicle");
  const ringR = (rb.radius + rb.outerRadius) / 2;
  // Walk & drive around the roundabout ring and verify actor renders cleanly in front of the island.
  actorLayers(rb.x, rb.y + ringR, false);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x = rb.x + Math.cos(a) * ringR,
      y = rb.y + Math.sin(a) * ringR;
    requireCheck(!blocked(x, y, 2.6), "Walker blocked on roundabout ring at angle " + k);
    requireCheck(!vehicleBlocked({ x, y, a: a - Math.PI / 2 }), "Vehicle blocked on roundabout ring at angle " + k);
  }
}

// Every ruelle, from the mouth on its wide street to the next junction: a walker and a
// motorbike pass, a saloon does not, and the houses stand close on both sides of the lane.
function checkMaraisAlley() {
  const alleys = town.roads.edges.filter((e) => e.class === "alley");
  requireCheck(alleys.length >= 8, "Expected the ruelles of the Marais and the Quartier Latin");
  for (const edge of alleys) {
    const a = town.roadNodeById.get(edge.a),
      b = town.roadNodeById.get(edge.b);
    const along = Math.atan2(b.y - a.y, b.x - a.x),
      length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = Math.cos(along),
      uy = Math.sin(along);
    const name = edge.a + "-" + edge.b;
    for (let d = 0; d <= length; d += 3) {
      const x = a.x + ux * d,
        y = a.y + uy * d;
      requireCheck(!blocked(x, y, 2.6), `Walker blocked in the ruelle ${name} at ${d}`);
      requireCheck(
        !vehicleBlocked({ x, y, a: along, halfLength: 7.5, halfWidth: 3.0 }),
        `Motorbike blocked in the ruelle ${name} at ${d}`,
      );
    }
    // Between the two junctions the walls stand 7 units either side of the centre line.
    for (const d of [70, length / 2, length - 70])
      for (const side of [-11, 11]) {
        const x = a.x + ux * d - uy * side,
          y = a.y + uy * d + ux * side;
        requireCheck(blocked(x, y, 2.6), `The ruelle ${name} is wider than a lane at ${d}`);
      }
    requireCheck(
      vehicleBlocked({ x: a.x + (ux * length) / 2, y: a.y + (uy * length) / 2, a: along, halfLength: 10.95, halfWidth: 4.8 }),
      "Saloon admitted into the ruelle " + name,
    );
  }
  // In a lane, at a mouth on the wide street and at the crossing of four, the walker stands
  // clear on the setts.
  actorLayers((X(10) + X(11)) / 2, Y(4), false);
  actorLayers(X(10), Y(3) + 40, false);
  actorLayers(X(9) + 40, Y(4), false);
  actorLayers(X(12) - 40, Y(4), false);
  actorLayers(X(10), Y(5) - 44, false);
  actorLayers(X(11), Y(4), false);
  actorLayers(X(9), Y(9) - 60, false);
}

function checkRiverBridgeAndIsland() {
  // Bridge col 6 (Pont de la Contrainte) admits walker & vehicle across the river.
  const bx = X(6),
    by = (town.river.top + town.river.bottom) / 2;
  requireCheck(!blocked(bx, by, 2.6), "Walker blocked on Pont de la Contrainte");
  requireCheck(!vehicleBlocked({ x: bx, y: by, a: Math.PI / 2 }), "Vehicle blocked on Pont de la Contrainte");
  actorLayers(bx, by, false);

  // Non-bridge open water col 5 blocks walker & vehicle while onWater is true.
  const wx = X(5),
    wy = town.river.top + 45;
  requireCheck(town.river.onWater(wx, wy, 8), "Non-bridge river water should satisfy onWater");
  requireCheck(blocked(wx, wy, 2.6), "Walker entered open river water");
  requireCheck(vehicleBlocked({ x: wx, y: wy, a: Math.PI / 2 }), "Vehicle entered open river water");

  // Île de la Ferre central square & south mooring quay are walkable and render cleanly.
  const m = town.river.moorings.find((q) => q.id === "ile-parvis");
  requireCheck(m && !blocked(m.quay.x, m.quay.y, 2.6), "Island mooring quay blocked");
  actorLayers(X(9), Y(7), false);
}

function checkTourDeFerUnderpass() {
  const tower = town.monuments.find((m) => m.id === "tour-fer");
  // Roads pass beneath Tour de Fer cleanly for walkers and vehicles; piers block both.
  requireCheck(!blocked(tower.x, tower.y, 2.6), "Walker blocked under Tour de Fer");
  requireCheck(!vehicleBlocked({ x: tower.x, y: tower.y, a: 0 }), "Vehicle blocked under Tour de Fer");
  for (const pier of tower.piers) {
    const px = pier.reduce((s, q) => s + q[0], 0) / pier.length;
    const py = pier.reduce((s, q) => s + q[1], 0) / pier.length;
    requireCheck(blocked(px, py, 2.6), "Tour de Fer pier did not block walker");
    requireCheck(vehicleBlocked({ x: px, y: py, a: 0 }), "Tour de Fer pier did not block vehicle");
  }
  // The near legs sweep over the east-west street: their ironwork is drawn over whoever
  // passes beneath, and clear of them a walker stands in front of everything.
  const ux = tower.x + paintings.towerBase.legs[0],
    uy = tower.y;
  const view = camera(ux, uy);
  Object.assign(p, { x: ux, y: uy, a: 0, moving: false });
  draw();
  const sample = () => pixels(view, ux - 3, uy - 13, 6, 9);
  const actual = sample();
  p.x = -100;
  draw();
  g.save();
  g.translate(-view.left, -view.top);
  Object.assign(p, { x: ux, y: uy });
  dude(p, true);
  g.restore();
  const covered = difference(actual, sample());
  p.x = -100;
  requireCheck(covered > 30, "Tour de Fer ironwork did not cover actor passing beneath: " + covered);
  actorLayers(tower.x, tower.y, false);
}

function checkRingVerticalPier() {
  const { left, right } = town.ring;
  const pier = town.ring.piers.find((q) => q.orientation === "vertical" && q.side === "west" && q.row === 3 && q.y > Y(3));
  requireCheck(pier, "Expected a bracket foot on the south kerb of the west leg");
  requireCheck(blocked(pier.x, pier.y - 1, 2.6), "Bracket foot did not block walker");
  requireCheck(vehicleBlocked({ x: pier.x, y: pier.y - 1, a: 0 }), "Bracket foot did not block vehicle");
  // A cross street runs clear beneath each side leg (row 3 in the west, row 5 in the east).
  for (const [x, y] of [
    [left, Y(3)],
    [right, Y(5)],
  ]) {
    requireCheck(!blocked(x, y, 2.6), "Walker blocked under the ring's side leg");
    requireCheck(!vehicleBlocked({ x, y, a: 0 }), "Vehicle blocked under the ring's side leg");
  }
  // The deck covers whoever is at its edge; the bracket's column covers whoever is behind
  // it; beyond the supports the street is open to the sky.
  actorLayers(left + 7.5, Y(3), true);
  actorLayers(pier.x + 3.6, pier.y - 9, true);
  actorLayers(left + 38, Y(3), false);
  // East: the deck's edge between two streets, and the near leg of the portal.
  actorLayers(right - 7.5, Y(4) + 70, true);
  actorLayers(right + 10, Y(5) + 6, true);
  actorLayers(right - 30, Y(5), false);
}

// Each of the four 150-unit curves stands on a painted column and an iron portal. Their feet
// stop a walker and a car; the street the north curves cross stays open beneath the deck; the
// column covers whoever is behind it and the portal leaves whoever is in front of it clear.
function checkRingCorners() {
  const { top, bottom } = town.ring;
  for (const support of cornerSupports) {
    const { x, y } = cornerSupportAt(town.ring, support);
    const feet = town.ring.piers.filter((q) => q.orientation === "corner" && Math.abs(q.centre - x) < 0.01 && q.y === y);
    requireCheck(feet.length === (support.kind === "portal" ? 2 : 1), "Corner support feet missing at " + x + "," + y);
    for (const foot of feet) {
      requireCheck(blocked(foot.x, foot.y - 1, 2.6), "Corner support foot did not block walker at " + foot.x);
      requireCheck(vehicleBlocked({ x: foot.x, y: foot.y - 1, a: 0 }), "Corner support foot did not block vehicle at " + foot.x);
    }
    const north = support.quadrant === 0 || support.quadrant === 3;
    const where = (check) => {
      try {
        check();
      } catch (error) {
        throw new Error(`Corner ${support.quadrant} ${support.kind}: ${error.message}`);
      }
    };
    if (support.kind === "column") {
      // The column's shaft rises from the back of the pavement to the deck and hides the
      // half of a walker behind it.
      requireCheck(Math.abs(y - (north ? top : bottom)) < 0.01, "Corner column off the pavement line");
      where(() => actorLayers(x + 3, y - 9, true));
    } else {
      // Behind the leg on the inside of the curve, clear of the deck passing overhead.
      const east = support.quadrant === 0 || support.quadrant === 1;
      where(() => actorLayers(x + (east ? -9.1 : 9.4), y - 6, true));
      where(() => actorLayers(x, y + 10, false));
    }
  }
  // The row-1 street runs clear under both north curves.
  for (const x of [282, 4500 - 282]) {
    requireCheck(!blocked(x, Y(1), 2.6), "Walker blocked under a north ring corner");
    requireCheck(!vehicleBlocked({ x, y: Y(1), a: 0 }), "Vehicle blocked under a north ring corner");
  }
}

// Arc des Saisies, the obelisk and the lamp standard rise from their islands: behind them a
// walker on the ring road is covered, in front they stand clear.
function checkMonumentIslands() {
  // Each walker stands far enough behind for the head to show above the silhouette while the
  // body is covered; in front of the island they stand clear.
  for (const [id, dx, behind] of [
    ["c3r3", 0, 34],
    ["c6r5", 0, 49],
    ["c13r2", 0, 32],
  ]) {
    const rb = town.roadNodeById.get(id);
    requireCheck(blocked(rb.x, rb.y, 2.6), "Island centre open at " + id);
    requireCheck(!blocked(rb.x + dx, rb.y - behind, 2.6), "Ring road blocked behind the monument at " + id);
    actorLayers(rb.x + dx, rb.y - behind, true);
    actorLayers(rb.x + dx, rb.y + 27, false);
  }
  // The painted kerb of a plain roundabout is wider than its traffic circle.
  const plain = town.roadNodeById.get("c13r2");
  requireCheck(blocked(plain.x + 16, plain.y, 1), "Walker entered the planted island");
}

// A T-junction's closed side is one frontage: nobody walks or drives on through it, and the
// pavement runs past it unbroken. A ruelle's mouth is the only gap in the side it leaves by.
function checkClosedArms() {
  for (const [col, row, dy] of [
    [1, 4, 60],
    [1, 5, -60],
    [12, 9, 60],
    [12, 10, -60],
  ]) {
    const x = X(col),
      y = Y(row) + dy;
    requireCheck(blocked(x, y, 2.6), "Walker entered the closed side at " + col + "," + row);
    requireCheck(vehicleBlocked({ x, y, a: Math.PI / 2 }), "Vehicle entered the closed side at " + col + "," + row);
    // The through street and its pavement on the closed side stay open across the junction.
    const pavement = Y(row) + (dy > 0 ? 20 : -25);
    for (let dx = -60; dx <= 60; dx += 6)
      requireCheck(!blocked(X(col) + dx, pavement, 2.6), `Pavement broken at ${col},${row} ${dx}`);
    requireCheck(!vehicleBlocked({ x, y: Y(row), a: 0 }), "Through street closed at " + col + "," + row);
    actorLayers(x, pavement, false);
  }
  // Beside a ruelle's mouth the frontage is solid.
  for (const [col, row, dx, dy] of [
    [9, 4, 40, -16],
    [9, 4, 40, 16],
    [12, 4, -40, 16],
    [10, 3, 16, 46],
    [11, 3, -16, 46],
    [10, 5, 16, -50],
    [11, 5, -16, -50],
  ])
    requireCheck(blocked(X(col) + dx, Y(row) + dy, 2.6), `Walker entered the frontage beside the ruelle at ${col},${row}`);
}

// Île de la Ferre and the quays as painted.
function checkPaintedRiver() {
  // Moored and passing boats bob on the clock; the quay checks compare still frames.
  const original = boatFleet.boats.splice(0);
  try {
    paintedRiver();
  } finally {
    boatFleet.boats.splice(0, boatFleet.boats.length, ...original);
  }
}
function paintedRiver() {
  const isl = town.river.islands[0],
    cy = Y(town.riverRow);
  // The bevelled ends of the island are water to a walker.
  requireCheck(blocked(isl.left + 8, isl.top + 6, 2.6), "Walker stepped off the island's north-west quay");
  requireCheck(blocked(isl.right - 8, isl.bottom - 6, 2.6), "Walker stepped off the island's south-east quay");
  // Notre-Dame-du-Port fills the north apron; the parvis in front of its portals is open.
  const cathedral = town.monuments.find((m) => m.id === "notre-dame-port");
  requireCheck(blocked(cathedral.x, cathedral.y, 2.6), "Walker entered the cathedral");
  requireCheck(blocked(cathedral.x, isl.top + 30, 2.6), "Walker entered the cathedral's nave");
  requireCheck(!blocked(cathedral.x, cy - 22.5, 2.6), "Cathedral parvis blocked");
  actorLayers(cathedral.x, cy - 22.5, false);
  // A stone bridge is open between its parapets.
  const y = (town.river.top + town.river.bottom) / 2;
  requireCheck(!blocked(X(3) + 25, y, 2.6), "Walker blocked on the bridge pavement");
  requireCheck(blocked(X(3) + 28, y, 2.6), "Walker climbed the bridge parapet");
  actorLayers(X(3) + 25, y, false);
  // The quay promenades either side of the water.
  actorLayers(X(7) - 30, town.river.top - 12, false);
  actorLayers(X(7) - 30, town.river.bottom + 8, false);
}

// Île de la Ferre's quay walls as painted: walkers stay on the cap, hulls stay off the stone,
// and the island's skyline stands in front of a boat in the north channel.
function checkIslandWalls() {
  const isl = river.islands[0],
    cy = Y(town.riverRow);
  // Nobody walks down the face of a wall: the island's south wall and the north bank's.
  for (const x of [X(8) + 60, X(9) + 60, X(10) - 100]) {
    requireCheck(!blocked(x, isl.bottom - 9, 2.6), "Island quay blocked above its wall");
    requireCheck(blocked(x, isl.bottom - 2.5, 2.6), "Walker stood on the face of the island wall");
    // The cathedral stands on the north wall; either side of it a promenade runs along the wall.
    requireCheck(blocked(x, isl.top + 6, 2.6) === (x === X(9) + 60), "Island's north promenade at " + x);
  }
  for (const col of [0, 5, 7, 9]) {
    requireCheck(!blocked(X(col) + 60, river.top - 11, 2.6), "Quay terrace blocked at column " + col);
    requireCheck(blocked(X(col) + 60, river.top - 4, 2.6), "Walker stood on the face of the north quay wall at column " + col);
  }
  // The island street runs from bridge to bridge.
  for (let x = X(8); x <= X(10); x += 29) requireCheck(!blocked(x, cy, 2.6) && !vehicleBlocked({ x, y: cy, a: 0 }), "Island street closed");
  // A garden behind its railings and a tree trunk are solid; the path between them is not.
  requireCheck(blocked(X(8) + 80, cy - 40, 2.6), "Walker entered the pavilion garden");
  requireCheck(blocked(X(10) - 80, cy - 40, 2.6), "Walker entered the law courts");
  const original = boatFleet.boats.splice(0);
  try {
    // Hulls: clear water in both channels, stone at the wall and at the bevelled point.
    const launch = makeBoat("launch", { x: X(9), y: isl.top - 12, a: 0 });
    requireCheck(hullOnWater(river, launch), "Launch blocked in the north channel");
    requireCheck(!hullOnWater(river, launch, X(9), isl.top - 4), "Hull entered the island's north wall");
    requireCheck(!hullOnWater(river, launch, X(9), isl.bottom + 4), "Hull entered the island's south wall");
    requireCheck(!hullOnWater(river, launch, isl.left + 4, cy - 30, Math.PI / 2), "Hull entered the island's west point");
    requireCheck(hullOnWater(river, launch, isl.left - 12, cy, Math.PI / 2), "Launch blocked off the west point");
    // The painted wall begins where the navigable water ends: beside the hull the wall shows.
    const wall = fromRiver("islandCathedral").y(riverMarks.islandCathedral.island[0][1]);
    requireCheck(Math.abs(cy + wall - isl.top) < 2.5, "Painted north wall is not on the published island edge");
    // Behind the spire the boat is covered; in the open channel it shows.
    const spire = { x: X(9), y: isl.top - 12 };
    const view = camera(spire.x, spire.y);
    draw();
    const sample = () => pixels(view, spire.x - 2, spire.y - 8, 4, 12),
      beside = () => pixels(view, spire.x - 22, spire.y - 6, 8, 8);
    const clearSpire = sample(),
      clearWater = beside();
    boatFleet.boats.push(launch);
    draw();
    boatFleet.boats.pop();
    requireCheck(difference(clearSpire, sample()) < 8, "A boat in the north channel covers the cathedral spire");
    requireCheck(difference(clearWater, beside()) > 40, "The boat behind the spire is missing beside it");
  } finally {
    boatFleet.boats.splice(0, boatFleet.boats.length, ...original);
  }
}

// The three painted bridges: parapets stop walkers and cars, the stone piers stop hulls,
// and bastions, ribs and parapets stand in front of whatever sails beneath.
function checkBridgeParapets() {
  const y = (river.top + river.bottom) / 2,
    channel = (river.top + river.islands[0].top) / 2;
  for (const [col, at] of [
    [3, y],
    [6, y],
    [8, channel],
    [10, channel],
  ]) {
    const half = paintings[town.cellKinds[town.riverRow][col]].walk;
    for (const side of [-1, 1]) {
      requireCheck(!blocked(X(col) + side * (half - 3), at, 2.6), "Walker blocked inside the parapet at column " + col);
      requireCheck(blocked(X(col) + side * (half + 1.5), at, 2.6), "Walker crossed the parapet at column " + col);
    }
    for (const lane of [-6, 6])
      requireCheck(!vehicleBlocked({ x: X(col) + lane, y: at, a: Math.PI / 2 }), "Traffic lane blocked on the bridge at column " + col);
    requireCheck(vehicleBlocked({ x: X(col) + half, y: at, a: Math.PI / 2 }), "Car drove along the parapet at column " + col);
  }
  const original = boatFleet.boats.splice(0);
  try {
    const stone = town.cellKinds[town.riverRow].indexOf("riverBridge"),
      x = X(stone),
      cy = Y(town.riverRow);
    const launch = makeBoat("launch", { x, y, a: 0 });
    // Every pier base and the north abutment stop a hull; the arches between them are open.
    const piers = paintings.riverBridge.piers;
    requireCheck(piers.length === 5, "Stone bridge piers missing");
    for (const pier of piers)
      requireCheck(!hullOnWater(river, launch, x + pier.left + 6, cy + (pier.top + pier.bottom) / 2), "Hull entered a bridge pier");
    for (let i = 0; i < piers.length - 1; i++) {
      const arch = cy + (piers[i].bottom + piers[i + 1].top) / 2;
      requireCheck(hullOnWater(river, launch, x, arch), "Arch " + i + " closed to a launch");
      requireCheck(hullOnWater(river, makeBoat("barge", {}), x, arch, 0) || i === 3, "Arch " + i + " closed to a barge");
    }
    // A hull behind a bastion is covered by it; clear of the bridge it shows.
    const bastion = { x: x + 45, y: cy + piers[2].top - 9 };
    const view = camera(bastion.x, bastion.y);
    draw();
    const sample = () => pixels(view, bastion.x - 6, bastion.y - 6, 12, 10),
      beside = () => pixels(view, x + 72, bastion.y - 5, 8, 8);
    const clearBastion = sample(),
      clearWater = beside();
    boatFleet.boats.push(makeBoat("launch", { x: x + 58, y: bastion.y, a: 0 }));
    draw();
    boatFleet.boats.pop();
    requireCheck(difference(clearBastion, sample()) < 8, "A boat behind the bastion covers it");
    requireCheck(difference(clearWater, beside()) > 40, "The boat behind the bastion is missing beside it");
    // Iron bridge: the ribs cover a hull, the pierced spandrels show it.
    const iron = X(town.cellKinds[town.riverRow].indexOf("riverIronBridge"));
    const rib = { x: iron - 59.5, y };
    const ironView = camera(rib.x, rib.y);
    draw();
    const ribSample = () => pixels(ironView, rib.x - 1.5, rib.y - 5, 3, 8),
      gap = () => pixels(ironView, iron - 44, rib.y - 5, 8, 8);
    const clearRib = ribSample(),
      clearGap = gap();
    boatFleet.boats.push(makeBoat("launch", { x: iron - 48, y, a: 0 }));
    draw();
    boatFleet.boats.pop();
    requireCheck(difference(clearRib, ribSample()) < 6, "A boat under the iron bridge covers its rib");
    requireCheck(difference(clearGap, gap()) > 40, "The boat does not show through the open spandrel");
  } finally {
    boatFleet.boats.splice(0, boatFleet.boats.length, ...original);
  }
}

// Hand-marked lanterns of the later paintings: a walker behind the post is covered by it, in
// front stands clear, and the post itself is solid. A lantern hung over the iron bridge
// covers whoever passes on its far side.
function checkPaintedLanterns() {
  const cy = Y(town.riverRow);
  const lanterns = [];
  for (const [col, key, pick] of [
    [7, "river", 0],
    [9, "islandCathedral", 4],
    [10, "islandEast", 5],
  ]) {
    const m = fromRiver(key),
      [lx, , foot] = riverMarks[key].lamps[pick];
    lanterns.push([X(col) + m.x(lx), cy + m.y(foot)]);
  }
  // One per district painting that carries lanterns.
  const seen = new Set();
  for (let row = 0; row < town.rows; row++)
    for (let col = 0; col < town.cols; col++) {
      const key = town.cellKinds[row][col];
      if (seen.has(key) || paintings[key].river) continue;
      // The southernmost one: on a ring row the others stand beneath the deck and the platforms.
      const lamp = streetProps(town, col, row)
        .filter((prop) => prop.item.painted && prop.item.radius && prop.item.key === key)
        .sort((a, b) => b.y - a.y)[0];
      if (!lamp) continue;
      seen.add(key);
      lanterns.push([lamp.x, lamp.y]);
    }
  requireCheck(seen.size >= 14, "Too few paintings carry their lanterns: " + [...seen]);
  for (const [x, y] of lanterns) {
    requireCheck(blocked(x, y - 0.5, 2.6), "Lantern post open to a walker at " + x.toFixed(0) + "," + y.toFixed(0));
    requireCheck(vehicleBlocked({ x, y: y - 0.5, a: 0 }), "Lantern post open to a car at " + x.toFixed(0) + "," + y.toFixed(0));
  }
  for (const [i, [x, y]] of lanterns.entries()) {
    try {
      actorLayers(x, y - 4.2, true);
      actorLayers(x, y + 4.4, false);
    } catch (error) {
      throw new Error("Lantern " + i + " at " + x.toFixed(1) + "," + y.toFixed(1) + ": " + error.message);
    }
  }
  const m = fromRiver("riverIronBridge"),
    [hx, top, , bracket] = riverMarks.riverIronBridge.hanging[4];
  const iron = X(town.cellKinds[town.riverRow].indexOf("riverIronBridge"));
  // Half a step out from under the glass, so that part of the walker still shows beside it.
  actorLayers(iron + m.x(hx) + 4.6, cy + m.y(bracket) - 3, true);
  actorLayers(iron + m.x(hx) + 4.6, cy + m.y(bracket) + 12, false);
  void top;
}

// A walker at a station door stands in front of the hall; the tower's rear gardens are solid.
function checkStationsAndGardens() {
  const station = town.ring.stations.find((st) => st.id === "porte-etoile");
  requireCheck(!blocked(station.street.x, station.street.y, 2.6), "Station door blocked");
  actorLayers(station.street.x, station.street.y, false);
  const side = town.ring.stations.find((st) => st.id === "viaduc-ouest");
  requireCheck(!blocked(side.street.x, side.street.y, 2.6), "Side station stair foot blocked");
  actorLayers(side.street.x + 12, side.street.y, false);
}

function checkDeckOverBoat(boats, deck, water) {
  draw();
  const clearDeck = deck(), clearWater = water();
  boatFleet.boats.push(...[boats].flat());
  draw();
  boatFleet.boats.length = 0;
  requireCheck(difference(clearDeck, deck()) < 8, "Water traffic covers the deck or its street actors");
  requireCheck(difference(clearWater, water()) > 50, "The boat is missing beside the bridge");
}

function bridgeOverBoats() {
  const original = boatFleet.boats.splice(0);
  try {
    for (const { x, halfWidth } of river.bridges) {
      const north = river.islands.find((isl) => x >= isl.left && x <= isl.right);
      const channels = north
        ? [(river.top + north.top) / 2, (north.bottom + river.bottom) / 2]
        : [(river.top + river.bottom) / 2];
      for (const y of channels) {
        const view = camera(x, y);
        const launch = makeBoat("launch", { x: x + halfWidth, y, a: 0 });
        const car = { x, y, a: Math.PI / 2, tint: "olive", condition: 100, speed: 0 };
        const npc = { x: x + 10, y, a: 0, moving: true, gait: 2, look: "worker" };
        for (const offset of [-halfWidth, 0, halfWidth])
          requireCheck(hullOnWater(river, launch, x + offset, y), "Launch blocked in a road bridge span");
        requireCheck(!vehicleBlocked(car), "Car cannot cross the bridge above the water");
        for (const walker of [p, npc]) {
          Object.assign(walker, { x: walker === p ? x - 9 : x + 10, y: y + 13, a: -Math.PI / 2 });
          for (let i = 0; i < 120; i++) move(walker, 0, -0.25, 2.6);
          requireCheck(walker.y <= y - 13, "Walker cannot cross the bridge above the water");
        }
        people.push(npc);
        cars.push(car);
        trails.push({ x: x + 17, y: y + 9, a: 0, t: 2 });
        // A stone bridge's bastions and an iron bridge's ribs reach 61 units out from the road.
        const clear = north ? halfWidth + 8 : 66;
        checkDeckOverBoat(
          [launch, makeBoat("launch", { x: x + clear + 7, y, a: 0 })],
          () => pixels(view, x - 12, y - 14, 32, 22),
          () => pixels(view, x + clear, y - 10, 14, 14),
        );
        people.length = cars.length = trails.length = 0;
      }
    }
  } finally {
    boatFleet.boats.splice(0, boatFleet.boats.length, ...original);
    p.x = p.y = -100;
    people.length = cars.length = trails.length = 0;
  }
}

function checkRailBridgesOverBoats() {
  const original = boatFleet.boats.splice(0);
  const { left, right, piers } = town.ring;
  try {
    for (const x of [left, right]) {
      const y = (river.top + river.bottom) / 2;
      const view = camera(x, y);
      const launch = makeBoat("launch", { x, y, a: 0 });
      for (const offset of [-22, 0, 22])
        requireCheck(hullOnWater(river, launch, x + offset, y), "Launch blocked by a rail bridge");
      const banks = piers.filter((pier) => pier.x === x &&
        (Math.abs(pier.y - river.top) < 12 || Math.abs(pier.y - river.bottom) < 12));
      requireCheck(banks.length === 2 && banks.every((pier) => !river.onWater(pier.x, pier.y, 0)),
        "Rail bridge supports must sit on the quays");
      checkDeckOverBoat(
        launch,
        () => pixels(view, x - 5, y - 14, 10, 22),
        () => pixels(view, x + 9, y - 10, 13, 14),
      );
    }
  } finally {
    boatFleet.boats.splice(0, boatFleet.boats.length, ...original);
  }
}

function checkRiverMoorings() {
  for (const mooring of river.moorings) {
    const { quay, x, y } = mooring;
    const boat = makeBoat("launch", mooring);
    requireCheck(hullOnWater(river, boat), "Berth blocked at " + mooring.id);
    requireCheck(!blocked(quay.x, quay.y, 2.6), "Boarding point blocked at " + mooring.id);
    requireCheck(blocked(x, y, 2.6) && vehicleBlocked({ x, y, a: 0 }), "Land traffic admitted into the berth");
    actorLayers(quay.x, quay.y, false);
  }
  for (const boat of boatFleet.boats.filter((b) => b.mooring)) {
    const room = river.bridges.every((b) => Math.abs(boat.x - b.x) > boat.halfLength + b.halfWidth);
    requireCheck(room, "A bridge obscures a moored " + boat.model);
  }
}

const checks = {
  "garage-gate-in-front": () => actorLayers(X(1) + 85.9, Y(1) - 25.2, false),
  "market-alley-in-front": () => actorLayers(X(1) + 143.9, Y(1) - 25.2, false),
  "market-lamp-behind": () => actorLayers(X(2) + 39, Y(1) - 24.8, true),
  "market-lamp-in-front": () => actorLayers(X(2) + 39, Y(1) - 16, false),
  "garage-vehicles": gateVehicle,
  "painting-joins": checkJoins,
  "back-passage": checkBackPassage,
  "bridge-deck-over-boats": bridgeOverBoats,
  "rail-bridges-over-boats": checkRailBridgesOverBoats,
  "river-moorings": checkRiverMoorings,
  "garage-crossing": () => {
    const v = { x: X(1) - 23, y: Y(1) - 23, a: -Math.PI * 0.65 };
    requireCheck(vehicleBlocked(v), "Angled bumper entered the corner");
    for (const a of [-Math.PI / 2, Math.PI / 2])
      for (let dy = -90; dy <= 8; dy++) {
        const x = X(1) + 6,
          y = Y(1) + dy;
        requireCheck(
          !blocked(x, y, 3) && !vehicleBlocked({ ...v, x, y, a }),
          "Closed railway underpass at " + dy,
        );
      }
  },
  "roundabout-island": checkRoundaboutIsland,
  "marais-alley": checkMaraisAlley,
  "river-bridge-and-island": checkRiverBridgeAndIsland,
  "tour-de-fer-underpass": checkTourDeFerUnderpass,
  "ring-side-legs": checkRingVerticalPier,
  "ring-corners": checkRingCorners,
  "monument-islands": checkMonumentIslands,
  "closed-arms": checkClosedArms,
  "painted-river": checkPaintedRiver,
  "island-quay-walls": checkIslandWalls,
  "bridge-parapets-and-piers": checkBridgeParapets,
  "painted-lanterns": checkPaintedLanterns,
  "stations": checkStationsAndGardens,
  "street-cache-scroll": checkStreetCacheScroll,
  // A walker behind the station's painted canopy is partly hidden while a train stands at the
  // platform; one at the hall door on the street in front of it stays fully visible.
  "ring-train-depth": () => {
    const { ring, tt } = ringLine();
    // A station on the north leg, where the deck runs east-west in front of the buildings.
    const index = ring.stations.findIndex((st) => st.id === "porte-etoile"),
      station = ring.stations[index];
    let t = 0;
    while (trainsetAt(tt, 0, t).station !== index) t += 0.1;
    game.time = t + 2;
    try {
      // The lower edge of the painted canopy, redrawn over the train, crosses the sampled body.
      actorLayers(station.stop.x - 15, station.stop.y - 18, true);
      actorLayers(station.stop.x - 15, station.stop.y + 8, false);
    } finally {
      game.time = 0;
    }
  },
};

// The street cache scrolls by whole pixels and paints only what comes into view. After a run of
// such scrolls it must match a full repaint along streets, across the river, on the diagonal and
// through the joins between paintings. A plate cut by the edge of a painted strip may shade its
// own far edge by a few levels; any missing or misplaced painting differs by far more.
function checkStreetCacheScroll() {
  const at = (col, row) => [X(col), Y(row)];
  const path = [at(1, 2), at(6, 2), at(6, 5), at(9, 8), at(3, 9), at(3, 6), at(8, 4)];
  const read = () => {
    const cache = streetCache();
    return cache.getContext("2d").getImageData(0, 0, cache.width, cache.height).data;
  };
  let compared = 0,
    worst = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1],
      [bx, by] = path[i];
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
    for (let k = 0; k < steps; k++) {
      camera(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps);
      draw();
      if (k % 25 !== 24) continue;
      const scrolled = read();
      repaintStreets();
      const repainted = read();
      let shaded = 0;
      for (let j = 0; j < scrolled.length; j++) {
        const d = Math.abs(scrolled[j] - repainted[j]);
        worst = Math.max(worst, d);
        if (d) shaded++;
      }
      requireCheck(
        worst <= 12 && shaded < scrolled.length / 200,
        "The scrolled street differs from a full repaint near " + Math.round(game.camX) + "," + Math.round(game.camY) +
          " (" + shaded + " channel values, up to " + worst + " levels)",
      );
      compared++;
    }
  }
  requireCheck(compared > 20, "Only " + compared + " street caches compared");
}

window.scenery = {
  ready: () => game.artReady,
  names: Object.keys(checks),
  check(name) {
    cars.length = people.length = fx.length = trails.length = 0;
    game.ride = null;
    game.flash = game.quipTime = 0;
    for (const job of town.jobs) done.add(job.id);
    p.x = p.y = -100;
    checks[name]();
  },
};
