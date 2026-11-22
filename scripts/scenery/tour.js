// Test-bundle entry for scenery captures: the normal game plus a camera that can be parked anywhere.
import "../../src/main.js";
import { cars, done, fx, game, p, people, trails } from "../../src/core/state.js";
import { canvas } from "../../src/platform/canvas.js";
import { town, X, Y } from "../../src/world/town.js";
import { draw } from "../../src/ui/renderer.js";

window.tour = {
  ready: () => game.artReady,
  town: () => ({
    width: town.width,
    height: town.height,
    cols: town.cols,
    rows: town.rows,
    kinds: town.cellKinds,
    vw: game.vw,
    vh: game.vh,
  }),
  cell: (col, row) => ({ x: X(col), y: Y(row) }),
  // Draw `frames` frames with the camera travelling along `path` at `step` units a frame and
  // return each frame's cost in milliseconds, the canvas flushed after every draw.
  drive(path, step) {
    cars.length = people.length = fx.length = trails.length = 0;
    p.x = p.y = -100;
    const flush = canvas.getContext("2d"),
      times = [];
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1],
        [bx, by] = path[i];
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
      for (let k = 0; k < steps; k++) {
        game.camX = ax + ((bx - ax) * k) / steps;
        game.camY = ay + ((by - ay) * k) / steps;
        const start = performance.now();
        draw();
        flush.getImageData(0, 0, 1, 1);
        times.push(performance.now() - start);
      }
    }
    return times;
  },
  // Draw the empty street at a camera centre and return the canvas as a PNG data URL.
  // `minimap` keeps the HUD's corner map in the frame; stitched captures leave it out.
  shot(x, y, { actors = false, minimap = false } = {}) {
    game.bareStreet = !minimap;
    if (!actors) {
      cars.length = people.length = fx.length = trails.length = 0;
      for (const job of town.jobs) done.add(job.id);
      p.x = p.y = -100;
      game.ride = null;
      game.flash = game.quipTime = 0;
    }
    game.camX = x;
    game.camY = y;
    draw();
    return canvas.toDataURL("image/png");
  },
};
