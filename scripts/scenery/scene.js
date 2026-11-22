// This entry point adds scenery fixtures to the normal game only in the test bundle.
import "../../src/main.js";
import { cars, done, fx, game, p, people, trails } from "../../src/core/state.js";
import { dude } from "../../src/art/pedestrians.js";
import { drawCar } from "../../src/art/vehicles.js";
import { canvas, g } from "../../src/platform/canvas.js";
import { blocked, move, vehicleBlocked } from "../../src/world/collision.js";
import { town, X, Y } from "../../src/world/town.js";
import { streetLayer } from "../../src/world/streets.js";
import { viewport } from "../../src/world/viewport.js";
import { draw } from "../../src/ui/renderer.js";

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

function checkJoins() {
  let joins = 0;
  for (const row of [town.ring.northRow, town.ring.southRow])
    for (let col = town.ring.minCol + 1; col <= town.ring.maxCol; col++) {
      const west = town.blocks[row][col - 1] === "market",
        east = town.blocks[row][col] === "market";
      if (west === east) continue;
      const seam = (X(col - 1) + X(col)) / 2,
        side = west ? 1 : -1,
        y = Y(row);
      const x = seam + side * 2.6,
        view = camera(x, y - 32);
      const walker = { x, y: y - 40 };
      for (let i = 0; i < 96; i++) move(walker, 0, 0.25, 2.6);
      requireCheck(walker.y >= y - 17, "Blocked entering the street at " + col + "," + row);
      for (let i = 0; i < 96; i++) move(walker, 0, -0.25, 2.6);
      requireCheck(walker.y <= y - 39, "Blocked entering the alley at " + col + "," + row);
      draw();
      const sample = () => pixels(view, seam + (west ? 0.4 : -2.4), y - 38, 2, 7);
      const actual = sample();
      streetLayer(view.left, view.top);
      const covered = difference(actual, sample());
      draw();
      requireCheck(
        covered < 8,
        "Stray half-pier on the " + (west ? "east" : "west") + " side of the alley at " + col + "," + row,
      );
      joins++;
    }
  requireCheck(joins > 0, "No market joins were exercised");
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
  // Verify the overhead iron tower deck/lattice covers an actor passing directly beneath the upper deck.
  const ux = tower.x,
    uy = tower.y - 24;
  const view = camera(tower.x, tower.y - 16);
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
  requireCheck(covered > 30, "Tour de Fer overhead ironwork did not cover actor passing beneath: " + covered);
}

function checkRingVerticalPier() {
  const pier = town.ring.piers.find((q) => q.orientation === "vertical" && q.side === "west");
  requireCheck(pier, "Expected vertical west ring viaduct pier");
  requireCheck(blocked(pier.x, pier.y, 2.6), "Vertical ring pier did not block walker");
  requireCheck(vehicleBlocked({ x: pier.x, y: pier.y, a: 0 }), "Vertical ring pier did not block vehicle");
  // On the east-west street passing beneath the west ring leg, walkers & cars pass unobstructed
  // while the overhead vertical viaduct deck covers actors passing directly beneath it.
  requireCheck(!blocked(pier.x, Y(3), 2.6), "Walker blocked under west ring viaduct street span");
  requireCheck(!vehicleBlocked({ x: pier.x, y: Y(3), a: 0 }), "Vehicle blocked under west ring viaduct street span");
  // At the edge of the overhead vertical viaduct deck, the viaduct partially occludes the actor;
  // stepping clear of the deck width reveals the actor completely unobstructed.
  actorLayers(pier.x + 7, Y(3), true);
  actorLayers(pier.x + 16, Y(3), false);
}

const checks = {
  "garage-gate-in-front": () => actorLayers(X(1) + 85.9, Y(1) - 25.2, false),
  "market-alley-in-front": () => actorLayers(X(1) + 143.9, Y(1) - 25.2, false),
  "market-lamp-behind": () => actorLayers(X(2) + 39, Y(1) - 24.8, true),
  "market-lamp-in-front": () => actorLayers(X(2) + 39, Y(1) - 16, false),
  "garage-vehicles": gateVehicle,
  "market-railway-joins": checkJoins,
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
  "ring-vertical-pier": checkRingVerticalPier,
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
