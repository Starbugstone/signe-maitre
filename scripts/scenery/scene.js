// This entry point adds scenery fixtures to the normal game only in the test bundle.
import "../../src/main.js";
import { cars, done, fx, game, p, people, trails } from "../../src/core/state.js";
import { dude } from "../../src/art/pedestrians.js";
import { boatFleet, hullOnWater, makeBoat, river } from "../../src/game/boats.js";
import { drawCar } from "../../src/art/vehicles.js";
import { canvas, g } from "../../src/platform/canvas.js";
import { blocked, move, vehicleBlocked } from "../../src/world/collision.js";
import { town, X, Y } from "../../src/world/town.js";
import { paintings } from "../../src/world/paintings.js";
import { streetLayer } from "../../src/world/streets.js";
import { viewport } from "../../src/world/viewport.js";
import { draw } from "../../src/ui/renderer.js";

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

// Every seam between two ring-row paintings is a lane under the deck. A walker enters it from
// the street beside the painted pier, and the deck covers them once they are beneath it.
function checkJoins() {
  let joins = 0;
  for (const row of [town.ring.northRow, town.ring.southRow])
    for (let col = town.ring.minCol + 2; col <= town.ring.maxCol - 1; col++) {
      const seam = (X(col - 1) + X(col)) / 2,
        y = Y(row),
        x = seam + 2.6;
      const walker = { x, y: y - 40 };
      for (let i = 0; i < 96; i++) move(walker, 0, 0.25, 2.6);
      requireCheck(walker.y >= y - 17, "Blocked entering the street at " + col + "," + row);
      for (let i = 0; i < 96; i++) move(walker, 0, -0.25, 2.6);
      requireCheck(walker.y <= y - 39, "Blocked entering the lane at " + col + "," + row);
      joins++;
    }
  requireCheck(joins > 20, "Too few ring seams were exercised");
  const seam = (X(4) + X(5)) / 2;
  // Head under the girder, feet still showing below it.
  actorLayers(seam + 2.6, Y(town.ring.northRow) - 51, true);
  actorLayers(seam + 2.6, Y(town.ring.northRow) - 30, false);
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

function checkMaraisAlley() {
  const alleyX = X(9.5),
    alleyY = (Y(4) + Y(5)) / 2;
  // Walker and motorbike fit inside the opened seam alley; sedan is rejected.
  requireCheck(!blocked(alleyX, alleyY, 2.6), "Walker blocked in opened seam alley");
  requireCheck(
    !vehicleBlocked({ x: alleyX, y: alleyY, a: Math.PI / 2, halfLength: 7.5, halfWidth: 3.0 }),
    "Motorbike blocked in opened seam alley",
  );
  requireCheck(
    vehicleBlocked({ x: alleyX, y: alleyY, a: Math.PI / 2, halfLength: 10.95, halfWidth: 4.8 }),
    "Sedan admitted into opened seam alley",
  );
  // Actor stands cleanly visible on the cobblestone alley paving.
  actorLayers(alleyX, alleyY, false);
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

// A street the road graph does not have is built over: nobody walks or drives into the frontage.
function checkClosedArms() {
  for (const [col, row, dx, dy] of [
    [14, 3, 60, 0],
    [14, 3, 0, -60],
    [1, 4, -60, 0],
    [5, 2, 0, -60],
    [7, 9, 0, 60],
  ]) {
    const x = X(col) + dx,
      y = Y(row) + dy;
    requireCheck(blocked(x, y, 2.6), "Walker entered the closed arm at " + col + "," + row);
    requireCheck(vehicleBlocked({ x, y, a: dx ? 0 : Math.PI / 2 }), "Vehicle entered the closed arm at " + col + "," + row);
  }
  // The dead end itself stays open up to the junction.
  requireCheck(!blocked(X(14) - 40, Y(3), 2.6), "Dead-end street closed");
  actorLayers(X(14), Y(3), false);
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
  const isl = town.river.islands[0];
  // Water inside the island's bounding box, outside the painted quay wall.
  requireCheck(blocked(isl.left + 30, isl.top + 6, 2.6), "Walker stepped off the island's north-west quay");
  requireCheck(blocked(isl.right - 30, isl.bottom - 6, 2.6), "Walker stepped off the island's south-east quay");
  // The apron in front of Notre-Dame-du-Port is open; the cathedral itself is not.
  const cathedral = town.monuments.find((m) => m.id === "notre-dame-port");
  requireCheck(blocked(cathedral.x, isl.top + 5, 2.6), "Walker entered the cathedral");
  requireCheck(!blocked(cathedral.x, isl.top + 24, 2.6), "Cathedral forecourt blocked");
  actorLayers(cathedral.x, isl.top + 24, false);
  // A stone bridge is open across its whole painted deck.
  const y = (town.river.top + town.river.bottom) / 2;
  requireCheck(!blocked(X(3) + 29, y, 2.6), "Walker blocked on the bridge pavement");
  requireCheck(blocked(X(3) + 40, y, 2.6), "Walker left the bridge deck");
  actorLayers(X(3) + 29, y, false);
  // The quay promenades either side of the water.
  actorLayers(X(7), town.river.top - 6, false);
  actorLayers(X(7), town.river.bottom + 8, false);
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

function checkDeckOverBoat(launch, deck, water) {
  draw();
  const clearDeck = deck(), clearWater = water();
  boatFleet.boats.push(launch);
  draw();
  boatFleet.boats.pop();
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
        checkDeckOverBoat(
          launch,
          () => pixels(view, x - 12, y - 14, 32, 22),
          () => pixels(view, x + halfWidth + 8, y - 10, 14, 14),
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
  "ring-seam-lanes": checkJoins,
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
  "monument-islands": checkMonumentIslands,
  "closed-arms": checkClosedArms,
  "painted-river": checkPaintedRiver,
  "stations": checkStationsAndGardens,
};

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
