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
  // Draw the empty street at a camera centre and return the canvas as a PNG data URL.
  shot(x, y, { actors = false } = {}) {
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
