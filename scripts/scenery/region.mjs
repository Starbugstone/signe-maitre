// Capture named rectangles of the empty city at gameplay scale, stitched from game frames.
//   node scripts/scenery/region.mjs OUT_DIR '{"marais":[2650,680,3600,1260]}' [viewportWidth] [viewportHeight]
// A rectangle is [left, top, right, bottom] in world units. The default 1280 × 760 viewport is
// the desktop gameplay zoom; a wider viewport zooms out as the game does.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { renderGame } from "../build.mjs";

const out = resolve(process.argv[2] || ".verify/evidence/scenery-regions");
const regions = JSON.parse(process.argv[3] || "{}");
const viewport = { width: Number(process.argv[4] || 1280), height: Number(process.argv[5] || 760) };
await mkdir(out, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "port-fer-region-"));
const browser = await chromium.launch({ executablePath: process.env.PF_CHROMIUM });
try {
  const file = join(dir, "game.html");
  await writeFile(file, await renderGame({ entry: 'import "./scripts/scenery/tour.js";' }));
  const page = await browser.newPage({ viewport, offline: true });
  page.on("pageerror", (error) => console.error("page error:", error.message));
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.tour?.ready(), null, { polling: 50, timeout: 120000 });
  for (const [name, [left, top, right, bottom]] of Object.entries(regions)) {
    const url = await page.evaluate(
      ([left, top, right, bottom]) => {
        const t = tour.town(),
          game = document.querySelector("#game");
        let stitched, scale;
        for (let y = top; y < bottom; y += t.vh)
          for (let x = left; x < right; x += t.vw) {
            // The camera stops at the edge of town: ask for a frame that lies inside it.
            const fx = Math.max(0, Math.min(x, t.width - t.vw)),
              fy = Math.max(0, Math.min(y, t.height - t.vh));
            tour.shot(fx + t.vw / 2, fy + t.vh / 2);
            scale = game.width / t.vw;
            if (!stitched) {
              stitched = document.createElement("canvas");
              stitched.width = Math.round((right - left) * scale);
              stitched.height = Math.round((bottom - top) * scale);
            }
            stitched.getContext("2d").drawImage(game, Math.round((fx - left) * scale), Math.round((fy - top) * scale));
          }
        return stitched.toDataURL("image/png");
      },
      [left, top, right, bottom],
    );
    await writeFile(join(out, name + ".png"), Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    console.log("Wrote", name);
  }
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
