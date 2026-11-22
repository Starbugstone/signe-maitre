// This entry point adds scenery fixtures to the normal game only in the test bundle.
import "../../src/main.js";
import { cars, done, fx, game, p, people, trails } from "../../src/core/state.js";
import { dude } from "../../src/art/pedestrians.js";
import { boatFleet, hullOnWater, makeBoat, river } from "../../src/game/boats.js";
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
        // Draw the same pose onto the empty street to measure exactly what the
        // foreground covered. Antialiased outlines can differ by a few colour levels.
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
        draw(); // Leave the failing scene on screen for the CI screenshot.
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
  for (const row of town.lines.keys())
    for (let col = 1; col < town.cols; col++) {
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

function bridgeOverBoats() {
  const bridge = river.bridges.find((b) => b.col === 2) ?? river.bridges[0];
  const { x, halfWidth } = bridge, y = (river.top + river.bottom) / 2;
  const view = camera(x, y);
  const launch = makeBoat("launch", { x: x + halfWidth, y, a: 0 });
  const car = { x, y, a: Math.PI / 2, tint: "olive", condition: 100, speed: 0 };
  const npc = { x: x + 10, y: y + 8, a: 0, moving: true, gait: 2, look: "worker" };
  const original = boatFleet.boats.splice(0);
  try {
    requireCheck(hullOnWater(river, launch), "Launch cannot enter the open arch");
    requireCheck(!vehicleBlocked(car), "Car cannot cross the bridge above the arch");
    for (const walker of [p, npc]) {
      const start = y + 13, target = y - 13;
      Object.assign(walker, { x: walker === p ? x - 9 : x + 10, y: start, a: -Math.PI / 2 });
      for (let i = 0; i < 120; i++) move(walker, 0, -0.25, 2.6);
      requireCheck(walker.y <= target, "Walker cannot cross the bridge above the arch");
    }
    people.push(npc);
    cars.push(car);
    trails.push({ x: x + 17, y: y + 9, a: 0, t: 2 });
    draw();
    const deck = () => pixels(view, x - 12, y - 14, 32, 22);
    const water = () => pixels(view, x + halfWidth + 8, y - 10, 14, 14);
    const clearDeck = deck(), clearWater = water();
    boatFleet.boats.push(launch);
    draw();
    requireCheck(difference(clearDeck, deck()) < 8, "Water traffic covers the deck or its street actors");
    requireCheck(difference(clearWater, water()) > 50, "The boat is missing beside the arch");
  } finally {
    boatFleet.boats.splice(0, boatFleet.boats.length, ...original);
    people.length = cars.length = 0;
  }
}

const checks = {
  "garage-gate-in-front": () => actorLayers(X(1) + 85.9, Y(1) - 25.2, false),
  "market-alley-in-front": () => actorLayers(X(1) + 143.9, Y(1) - 25.2, false),
  "market-lamp-behind": () => actorLayers(X(2) + 39, Y(1) - 24.8, true),
  "market-lamp-in-front": () => actorLayers(X(2) + 39, Y(1) - 16, false),
  "garage-vehicles": gateVehicle,
  "market-railway-joins": checkJoins,
  "bridge-deck-over-boats": bridgeOverBoats,
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
